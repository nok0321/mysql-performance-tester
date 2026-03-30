/**
 * SqlStore - JSON file persistence for SQL library
 * Saves and manages SQL snippets in web/data/sql-library.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

/** Stored SQL snippet record */
export interface SqlRecord {
  id: string;
  name: string;
  sql: string;
  category: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new SQL snippet */
export interface CreateSqlInput {
  name?: string;
  sql?: string;
  category?: string;
  description?: string;
  tags?: string[];
}

/** Input for updating an existing SQL snippet */
export interface UpdateSqlInput {
  name?: string;
  sql?: string;
  category?: string;
  description?: string;
  tags?: string[];
}

/** Filter options for getAll() */
export interface SqlFilter {
  category?: string;
  keyword?: string;
}

// In-process mutex to prevent write conflicts
let _lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = _lock.then(fn);
  _lock = next.catch(() => {});
  return next;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'sql-library.json');

/** Atomic write: write to a tmp file then rename */
async function writeAtomic(filePath: string, data: SqlRecord[]): Promise<void> {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * Safely read a JSON file.
 * On parse failure, back up the corrupted file and return an empty array.
 */
async function safeReadJson(filePath: string): Promise<SqlRecord[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw) as SqlRecord[];
  } catch {
    const backup = `${filePath}.corrupt_${Date.now()}`;
    await fs.rename(filePath, backup).catch(() => {});
    console.error(`[Store] JSON parse failed for ${filePath}. Backed up to ${backup}. Resetting to empty.`);
    await fs.writeFile(filePath, '[]', 'utf8').catch(() => {});
    return [];
  }
}

/** Initialize the store (create the file if it does not exist) */
async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * Get all SQL snippets (with optional filter)
 */
export async function getAll(filter: SqlFilter = {}): Promise<SqlRecord[]> {
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
 * Get a SQL snippet by ID
 */
export async function getById(id: string): Promise<SqlRecord | null> {
  await ensureStore();
  const items = await safeReadJson(STORE_FILE);
  return items.find(s => s.id === id) || null;
}

/**
 * Create a new SQL snippet
 */
export function create(snippet: CreateSqlInput): Promise<SqlRecord> {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);

    const newItem: SqlRecord = {
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

/** Whitelist of fields accepted by update() */
const UPDATABLE_FIELDS = new Set(['name', 'sql', 'category', 'description', 'tags']);

/**
 * Update a SQL snippet (whitelist approach)
 */
export function update(id: string, updates: UpdateSqlInput): Promise<SqlRecord | null> {
  return withLock(async () => {
    await ensureStore();
    const items = await safeReadJson(STORE_FILE);

    const index = items.findIndex(s => s.id === id);
    if (index === -1) return null;

    // Whitelist: only apply allowed fields
    const safeUpdates: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        safeUpdates[field] = (updates as Record<string, unknown>)[field];
      }
    }

    items[index] = {
      ...items[index],
      ...safeUpdates,
      id, // ID cannot be changed
      updatedAt: new Date().toISOString()
    } as SqlRecord;

    await writeAtomic(STORE_FILE, items);
    return items[index];
  });
}

/**
 * Delete a SQL snippet
 */
export function remove(id: string): Promise<boolean> {
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
 * Get a list of available categories
 */
export async function getCategories(): Promise<string[]> {
  await ensureStore();
  const items = await safeReadJson(STORE_FILE);
  const cats = [...new Set(items.map(s => s.category))];
  return cats.sort();
}
