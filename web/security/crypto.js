/**
 * crypto.js - パスワード暗号化ユーティリティ
 *
 * AES-256-GCM でDB接続パスワードを暗号化して保存する。
 * 暗号化キーは環境変数 ENCRYPTION_KEY から取得する。
 *
 * ENCRYPTION_KEY が未設定の場合は警告を出力してパスワードを平文のまま扱う
 * （後方互換性確保）。本番運用では必ず設定すること。
 *
 * 保存形式: enc:<iv_base64>:<authTag_base64>:<ciphertext_base64>
 * 平文（移行前データ）は enc: プレフィックスがないため自動判別される。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM   = 'aes-256-gcm';
const LEGACY_SALT = 'mysql-perf-tester-v1'; // kept for backward-compat decryption only
const ENC_PREFIX  = 'enc:';

let _warnedNoKey = false;

/**
 * 環境変数 ENCRYPTION_KEY と指定された SALT から 32 バイトの対称鍵を導出する。
 * 未設定の場合は null を返す（平文モード）。
 * @param {Buffer|string} salt
 */
function deriveKey(salt) {
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
 * 文字列を暗号化する。
 * ENCRYPTION_KEY 未設定時は平文をそのまま返す。
 *
 * @param {string} plaintext
 * @returns {string} 暗号化済み文字列 または 平文
 */
export function encrypt(plaintext) {
  if (!plaintext) return plaintext;

  // ランダム SALT を生成して鍵を導出（レインボーテーブル攻撃対策）
  const salt = randomBytes(16);
  const key  = deriveKey(salt);
  if (!key) return plaintext; // 平文モード

  const iv        = randomBytes(12); // GCM 推奨: 96bit
  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  // 保存形式 (v2): enc:<salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64> (4 parts)
  return (
    ENC_PREFIX +
    salt.toString('base64')     + ':' +
    iv.toString('base64')       + ':' +
    authTag.toString('base64')  + ':' +
    encrypted.toString('base64')
  );
}

/**
 * 暗号化文字列を復号する。
 * enc: プレフィックスがない場合は平文として扱う（移行前データとの後方互換）。
 * ENCRYPTION_KEY 未設定時は入力をそのまま返す。
 *
 * @param {string} ciphertext
 * @returns {string} 復号済み文字列
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext; // 平文（移行前）

  try {
    const body  = ciphertext.slice(ENC_PREFIX.length);
    const parts = body.split(':');

    let key, iv, authTag, encBuf;

    if (parts.length === 4) {
      // v2 形式: <salt_b64>:<iv_b64>:<authTag_b64>:<ciphertext_b64>
      const [saltB64, ivB64, authTagB64, encB64] = parts;
      const salt = Buffer.from(saltB64, 'base64');
      key     = deriveKey(salt);
      iv      = Buffer.from(ivB64,      'base64');
      authTag = Buffer.from(authTagB64, 'base64');
      encBuf  = Buffer.from(encB64,     'base64');
    } else if (parts.length === 3) {
      // v1 (レガシー) 形式: <iv_b64>:<authTag_b64>:<ciphertext_b64>
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
    console.error('[Security] パスワードの復号に失敗しました:', err.message);
    return '';
  }
}

/**
 * 文字列が暗号化済みかどうかを判定する。
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}
