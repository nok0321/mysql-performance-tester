/**
 * ConnectionsStore - SQLite persistence for connection settings
 *
 * Security:
 * - Passwords are encrypted with AES-256-GCM (see crypto.ts)
 * - update() accepts only whitelisted fields
 * - getAll() masks passwords before returning
 * - getById() is for internal use only (includes decrypted password)
 */

import { randomUUID } from 'crypto';
import { getDb } from './database.js';
import { encrypt, decrypt } from '../security/crypto.js';

/** Stored connection record */
export interface ConnectionRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolSize: number;
  createdAt: string;
  updatedAt: string;
}

/** Connection record with masked password (returned by getAll/create/update) */
export interface MaskedConnectionRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  passwordMasked: string;
  poolSize: number;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new connection */
export interface CreateConnectionInput {
  name?: string;
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  password?: string;
  poolSize?: number | string;
}

/** Input for updating an existing connection */
export interface UpdateConnectionInput {
  name?: string;
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  password?: string;
  poolSize?: number | string;
}

/** SQLite row shape */
interface ConnectionRow {
  id: string;
  name: string;
  host: string;
  port: number;
  database_: string;
  user_: string;
  password: string;
  pool_size: number;
  created_at: string;
  updated_at: string;
}

/** Map a SQLite row to a ConnectionRecord */
function rowToRecord(row: ConnectionRow): ConnectionRecord {
  return {
    id:        row.id,
    name:      row.name,
    host:      row.host,
    port:      row.port,
    database:  row.database_,
    user:      row.user_,
    password:  row.password,
    poolSize:  row.pool_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mask a connection record's password */
function maskRecord(record: ConnectionRecord): MaskedConnectionRecord {
  const { password, ...rest } = record;
  return { ...rest, passwordMasked: password ? '••••••••' : '' };
}

/** Whitelist of fields accepted by update() */
const UPDATABLE_FIELDS = new Set(['name', 'host', 'port', 'database', 'user', 'password', 'poolSize']);

/**
 * Get all connection settings (passwords are masked)
 */
export async function getAll(): Promise<MaskedConnectionRecord[]> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM connections').all() as ConnectionRow[];
  return rows.map(row => maskRecord(rowToRecord(row)));
}

/**
 * Get a connection setting by ID (internal use - includes decrypted password)
 */
export async function getById(id: string): Promise<ConnectionRecord | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow | undefined;
  if (!row) return null;
  const record = rowToRecord(row);
  return { ...record, password: decrypt(record.password) };
}

/**
 * Create a new connection setting (password is encrypted before storage)
 */
export async function create(connection: CreateConnectionInput): Promise<MaskedConnectionRecord> {
  const db = getDb();
  const now = new Date().toISOString();
  const record: ConnectionRecord = {
    id:        `conn_${randomUUID()}`,
    name:      connection.name     || 'New Connection',
    host:      connection.host     || 'localhost',
    port:      Number(connection.port) || 3306,
    database:  connection.database || '',
    user:      connection.user     || 'root',
    password:  encrypt(connection.password || ''),
    poolSize:  Number(connection.poolSize) || 10,
    createdAt: now,
    updatedAt: now,
  };

  // Dynamic name: "Connection N+1"
  if (!connection.name) {
    const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM connections').get() as { cnt: number };
    record.name = `Connection ${countRow.cnt + 1}`;
  }

  db.prepare(`
    INSERT INTO connections (id, name, host, port, database_, user_, password, pool_size, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.name, record.host, record.port, record.database, record.user, record.password, record.poolSize, record.createdAt, record.updatedAt);

  return maskRecord(record);
}

/**
 * Update a connection setting (whitelist approach)
 */
export async function update(id: string, updates: UpdateConnectionInput): Promise<MaskedConnectionRecord | null> {
  const db = getDb();

  // Check existence first
  const existing = db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow | undefined;
  if (!existing) return null;

  // Build SET clause from whitelisted fields
  const setClauses: string[] = [];
  const params: unknown[] = [];

  // Map camelCase input fields to snake_case columns
  const fieldToColumn: Record<string, string> = {
    name: 'name', host: 'host', port: 'port',
    database: 'database_', user: 'user_', password: 'password', poolSize: 'pool_size',
  };

  for (const field of UPDATABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    let value = (updates as Record<string, unknown>)[field];

    if (field === 'port') {
      value = Number(value) || existing.port;
    } else if (field === 'poolSize') {
      value = Number(value) || existing.pool_size;
    } else if (field === 'password') {
      value = encrypt((value as string) || '');
    }

    setClauses.push(`${fieldToColumn[field]} = ?`);
    params.push(value);
  }

  if (setClauses.length === 0) {
    return maskRecord(rowToRecord(existing));
  }

  // Always update updated_at
  setClauses.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE connections SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow;
  return maskRecord(rowToRecord(updated));
}

/**
 * Delete a connection setting
 */
export async function remove(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare('DELETE FROM connections WHERE id = ?').run(id);
  return result.changes > 0;
}
