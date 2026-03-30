/**
 * crypto.ts - Password encryption utility
 *
 * Encrypts DB connection passwords with AES-256-GCM.
 * The encryption key is read from the ENCRYPTION_KEY environment variable.
 *
 * When ENCRYPTION_KEY is not set, a warning is logged and passwords are
 * stored in plain text (backward compatibility). Always set the key in
 * production.
 *
 * Storage format: enc:<salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 * Plain text (pre-migration data) is auto-detected by the absence of the
 * enc: prefix.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM   = 'aes-256-gcm';
const LEGACY_SALT = 'mysql-perf-tester-v1'; // kept for backward-compat decryption only
const ENC_PREFIX  = 'enc:';

let _warnedNoKey = false;

/**
 * Derive a 32-byte symmetric key from ENCRYPTION_KEY and the given salt.
 * Returns null when ENCRYPTION_KEY is not set (plain text mode).
 */
function deriveKey(salt: Buffer | string): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    if (!_warnedNoKey) {
      console.warn(
        '[Security] ENCRYPTION_KEY が設定されていません。' +
        'DB接続パスワードが平文で保存されます。' +
        '.env に ENCRYPTION_KEY=<32文字以上のランダム文字列> を設定してください。'
      );
      _warnedNoKey = true;
    }
    return null;
  }
  return scryptSync(secret, salt, 32);
}

/**
 * Encrypt a string.
 * Returns plain text as-is when ENCRYPTION_KEY is not set.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  // Generate a random salt for key derivation (rainbow-table attack prevention)
  const salt = randomBytes(16);
  const key  = deriveKey(salt);
  if (!key) return plaintext; // plain text mode

  const iv        = randomBytes(12); // GCM recommended: 96 bits
  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  // Storage format (v2): enc:<salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64> (4 parts)
  return (
    ENC_PREFIX +
    salt.toString('base64')     + ':' +
    iv.toString('base64')       + ':' +
    authTag.toString('base64')  + ':' +
    encrypted.toString('base64')
  );
}

/**
 * Decrypt an encrypted string.
 * Returns plain text as-is when the enc: prefix is absent (pre-migration data).
 * Returns the input as-is when ENCRYPTION_KEY is not set.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext; // plain text (pre-migration)

  try {
    const body  = ciphertext.slice(ENC_PREFIX.length);
    const parts = body.split(':');

    let key: Buffer | null;
    let iv: Buffer;
    let authTag: Buffer;
    let encBuf: Buffer;

    if (parts.length === 4) {
      // v2 format: <salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64>
      const [saltB64, ivB64, authTagB64, encB64] = parts;
      const salt = Buffer.from(saltB64, 'base64');
      key     = deriveKey(salt);
      iv      = Buffer.from(ivB64,      'base64');
      authTag = Buffer.from(authTagB64, 'base64');
      encBuf  = Buffer.from(encB64,     'base64');
    } else if (parts.length === 3) {
      // v1 (legacy) format: <iv_b64>:<authTag_b64>:<ciphertext_b64>
      const [ivB64, authTagB64, encB64] = parts;
      key     = deriveKey(LEGACY_SALT);
      iv      = Buffer.from(ivB64,      'base64');
      authTag = Buffer.from(authTagB64, 'base64');
      encBuf  = Buffer.from(encB64,     'base64');
    } else {
      throw new Error('invalid format');
    }

    if (!key) {
      console.error('[Security] ENCRYPTION_KEY が設定されていないため、暗号化パスワードを復号できません。');
      return '';
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(encBuf).toString('utf8') + decipher.final('utf8');
  } catch (err) {
    console.error('[Security] パスワードの復号に失敗しました:', (err as Error).message);
    return '';
  }
}

/**
 * Check whether a string is encrypted.
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}
