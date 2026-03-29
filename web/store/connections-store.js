/**
 * ConnectionsStore - 接続設定の JSON ファイル永続化
 * web/data/connections.json に接続先情報を保存・管理する
 *
 * セキュリティ対策:
 * - パスワードは AES-256-GCM で暗号化して保存（crypto.js 参照）
 * - update() は許可フィールドのみ受け付けるホワイトリスト方式
 * - getAll() はパスワードをマスクして返す
 * - getById() は内部用途のみ（パスワード含む）
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { encrypt, decrypt } from '../security/crypto.js';

// 書き込みを伴う操作の競合防止用インプロセスミューテックス
let _lock = Promise.resolve();
function withLock(fn) {
  const next = _lock.then(fn);
  _lock = next.catch(() => {});
  return next;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'connections.json');

/** アトミック書き込み: tmp ファイルに書き込んでからリネーム */
async function writeAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * JSON ファイルを安全に読み込む。
 * パース失敗時は壊れたファイルをバックアップして空配列を返す。
 */
async function safeReadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    // バックアップを残してから空配列で復旧
    const backup = `${filePath}.corrupt_${Date.now()}`;
    await fs.rename(filePath, backup).catch(() => {});
    console.error(`[Store] JSON parse failed for ${filePath}. Backed up to ${backup}. Resetting to empty.`);
    await fs.writeFile(filePath, '[]', 'utf8').catch(() => {});
    return [];
  }
}

/** update() で受け付けるフィールドのホワイトリスト */
const UPDATABLE_FIELDS = new Set(['name', 'host', 'port', 'database', 'user', 'password', 'poolSize']);

/**
 * ストアの初期化（ファイルが存在しない場合は作成）
 */
async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * 全接続設定を取得（パスワードはマスク）
 * @returns {Promise<Array>}
 */
export async function getAll() {
  await ensureStore();
  const connections = await safeReadJson(STORE_FILE);
  return connections.map(({ password, ...rest }) => ({
    ...rest,
    passwordMasked: password ? '••••••••' : ''
  }));
}

/**
 * ID で接続設定を取得（パスワード含む内部用）
 * パスワードは復号して返す。
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getById(id) {
  await ensureStore();
  const connections = await safeReadJson(STORE_FILE);
  const conn = connections.find(c => c.id === id) || null;
  if (!conn) return null;

  // パスワードを復号して返す
  return { ...conn, password: decrypt(conn.password) };
}

/**
 * 接続設定を追加（パスワードは暗号化して保存）
 * @param {Object} connection
 * @returns {Promise<Object>}
 */
export function create(connection) {
  return withLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const connections = JSON.parse(raw);

    const newConnection = {
      id:        `conn_${randomUUID()}`,
      name:      connection.name     || `Connection ${connections.length + 1}`,
      host:      connection.host     || 'localhost',
      port:      Number(connection.port) || 3306,
      database:  connection.database || '',
      user:      connection.user     || 'root',
      password:  encrypt(connection.password || ''),  // 暗号化して保存
      poolSize:  Number(connection.poolSize) || 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    connections.push(newConnection);
    await writeAtomic(STORE_FILE, connections);

    const { password, ...rest } = newConnection;
    return { ...rest, passwordMasked: password ? '••••••••' : '' };
  });
}

/**
 * 接続設定を更新（ホワイトリスト方式）
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export function update(id, updates) {
  return withLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const connections = JSON.parse(raw);

    const index = connections.findIndex(c => c.id === id);
    if (index === -1) return null;

    // ホワイトリスト: 許可されたフィールドのみ適用
    const safeUpdates = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        safeUpdates[field] = updates[field];
      }
    }

    // ポートの型を保証
    if (safeUpdates.port !== undefined) {
      safeUpdates.port = Number(safeUpdates.port) || connections[index].port;
    }
    if (safeUpdates.poolSize !== undefined) {
      safeUpdates.poolSize = Number(safeUpdates.poolSize) || connections[index].poolSize;
    }

    // パスワードが更新される場合は暗号化
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'password')) {
      safeUpdates.password = encrypt(safeUpdates.password || '');
    }

    connections[index] = {
      ...connections[index],
      ...safeUpdates,
      id,  // ID は変更不可
      updatedAt: new Date().toISOString()
    };

    await writeAtomic(STORE_FILE, connections);
    const { password, ...rest } = connections[index];
    return { ...rest, passwordMasked: password ? '••••••••' : '' };
  });
}

/**
 * 接続設定を削除
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export function remove(id) {
  return withLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const connections = JSON.parse(raw);

    const index = connections.findIndex(c => c.id === id);
    if (index === -1) return false;

    connections.splice(index, 1);
    await writeAtomic(STORE_FILE, connections);
    return true;
  });
}
