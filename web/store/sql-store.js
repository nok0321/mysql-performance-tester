/**
 * SqlStore - SQL ライブラリの JSON ファイル永続化
 * web/data/sql-library.json に SQL スニペットを保存・管理する
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

// 書き込みを伴う操作の競合防止用インプロセスミューテックス
let _lock = Promise.resolve();
function withLock(fn) {
  const next = _lock.then(fn);
  _lock = next.catch(() => {});
  return next;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'sql-library.json');

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
  } catch {
    const backup = `${filePath}.corrupt_${Date.now()}`;
    await fs.rename(filePath, backup).catch(() => {});
    console.error(`[Store] JSON parse failed for ${filePath}. Backed up to ${backup}. Resetting to empty.`);
    await fs.writeFile(filePath, '[]', 'utf8').catch(() => {});
    return [];
  }
}

/** ストアの初期化（ファイルが存在しない場合は作成） */
async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * 全 SQL スニペットを取得
 * @param {Object} [filter] - { category, keyword }
 * @returns {Promise<Array>}
 */
export async function getAll(filter = {}) {
  await ensureStore();
  let items = await safeReadJson(STORE_FILE);

  if (filter.category) {
    items = items.filter(s => s.category === filter.category);
  }
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    items = items.filter(s =>
      s.name.toLowerCase().includes(kw) ||
      s.sql.toLowerCase().includes(kw)
    );
  }

  return items;
}

/**
 * ID で SQL スニペットを取得
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getById(id) {
  await ensureStore();
  const items = await safeReadJson(STORE_FILE);
  return items.find(s => s.id === id) || null;
}

/**
 * SQL スニペットを追加
 * @param {Object} snippet - { name, sql, category, description }
 * @returns {Promise<Object>}
 */
export function create(snippet) {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);

    const newItem = {
      id: `sql_${randomUUID()}`,
      name: snippet.name || 'Untitled SQL',
      sql: snippet.sql || '',
      category: snippet.category || 'SELECT',
      description: snippet.description || '',
      tags: snippet.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.push(newItem);
    await writeAtomic(STORE_FILE, items);
    return newItem;
  });
}

/** update() で受け付けるフィールドのホワイトリスト */
const UPDATABLE_FIELDS = new Set(['name', 'sql', 'category', 'description', 'tags']);

/**
 * SQL スニペットを更新（ホワイトリスト方式）
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export function update(id, updates) {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);

    const index = items.findIndex(s => s.id === id);
    if (index === -1) return null;

    // ホワイトリスト: 許可されたフィールドのみ適用
    const safeUpdates = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        safeUpdates[field] = updates[field];
      }
    }

    items[index] = {
      ...items[index],
      ...safeUpdates,
      id, // ID は変更不可
      updatedAt: new Date().toISOString()
    };

    await writeAtomic(STORE_FILE, items);
    return items[index];
  });
}

/**
 * SQL スニペットを削除
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export function remove(id) {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);

    const index = items.findIndex(s => s.id === id);
    if (index === -1) return false;

    items.splice(index, 1);
    await writeAtomic(STORE_FILE, items);
    return true;
  });
}

/**
 * 利用可能なカテゴリ一覧を取得
 * @returns {Promise<string[]>}
 */
export async function getCategories() {
  await ensureStore();
  const items = await safeReadJson(STORE_FILE);
  const cats = [...new Set(items.map(s => s.category))];
  return cats.sort();
}
