/**
 * SqlStore - SQLite persistence for SQL library
 * Manages SQL snippets used for performance testing.
 */

import { randomUUID } from 'crypto';
import { getDb } from './database.js';

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

/** SQLite row shape */
interface SqlRow {
  id: string;
  name: string;
  sql: string;
  category: string;
  description: string;
  tags: string;          // JSON-serialized string[]
  created_at: string;
  updated_at: string;
}

/** Map a SQLite row to a SqlRecord */
function rowToRecord(row: SqlRow): SqlRecord {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return {
    id:          row.id,
    name:        row.name,
    sql:         row.sql,
    category:    row.category,
    description: row.description,
    tags,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

/** Whitelist of fields accepted by update() */
const UPDATABLE_FIELDS = new Set(['name', 'sql', 'category', 'description', 'tags']);

/**
 * Get all SQL snippets (with optional filter)
 */
export async function getAll(filter: SqlFilter = {}): Promise<SqlRecord[]> {
  const db = getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.category) {
    conditions.push('category = ?');
    params.push(filter.category);
  }
  if (filter.keyword) {
    const pattern = `%${filter.keyword}%`;
    conditions.push('(name LIKE ? OR sql LIKE ?)');
    params.push(pattern, pattern);
  }

  let sql = 'SELECT * FROM sql_items';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  const rows = db.prepare(sql).all(...params) as SqlRow[];
  return rows.map(rowToRecord);
}

/**
 * Get a SQL snippet by ID
 */
export async function getById(id: string): Promise<SqlRecord | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sql_items WHERE id = ?').get(id) as SqlRow | undefined;
  return row ? rowToRecord(row) : null;
}

/**
 * Create a new SQL snippet
 */
export async function create(snippet: CreateSqlInput): Promise<SqlRecord> {
  const db = getDb();
  const now = new Date().toISOString();
  const record: SqlRecord = {
    id:          `sql_${randomUUID()}`,
    name:        snippet.name        || 'Untitled SQL',
    sql:         snippet.sql         || '',
    category:    snippet.category    || 'SELECT',
    description: snippet.description || '',
    tags:        snippet.tags        || [],
    createdAt:   now,
    updatedAt:   now,
  };

  db.prepare(`
    INSERT INTO sql_items (id, name, sql, category, description, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.name, record.sql, record.category, record.description, JSON.stringify(record.tags), record.createdAt, record.updatedAt);

  return record;
}

/**
 * Update a SQL snippet (whitelist approach)
 */
export async function update(id: string, updates: UpdateSqlInput): Promise<SqlRecord | null> {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM sql_items WHERE id = ?').get(id) as SqlRow | undefined;
  if (!existing) return null;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const field of UPDATABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    let value = (updates as Record<string, unknown>)[field];

    // Serialize tags array to JSON
    if (field === 'tags') {
      value = JSON.stringify(value || []);
    }

    setClauses.push(`${field} = ?`);
    params.push(value);
  }

  if (setClauses.length === 0) {
    return rowToRecord(existing);
  }

  setClauses.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE sql_items SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM sql_items WHERE id = ?').get(id) as SqlRow;
  return rowToRecord(updated);
}

/**
 * Delete a SQL snippet
 */
export async function remove(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare('DELETE FROM sql_items WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Get a list of available categories
 */
export async function getCategories(): Promise<string[]> {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT category FROM sql_items ORDER BY category').all() as Array<{ category: string }>;
  return rows.map(r => r.category);
}
