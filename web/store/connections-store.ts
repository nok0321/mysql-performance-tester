/**
 * ConnectionsStore - JSON file persistence for connection settings
 * Saves and manages connection settings in web/data/connections.json
 *
 * Security:
 * - Passwords are encrypted with AES-256-GCM (see crypto.ts)
 * - update() accepts only whitelisted fields
 * - getAll() masks passwords before returning
 * - getById() is for internal use only (includes password)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
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

// In-process mutex to prevent write conflicts
let _lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = _lock.then(fn);
  _lock = next.catch(() => {});
  return next;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'connections.json');

/** Atomic write: write to a tmp file then rename */
async function writeAtomic(filePath: string, data: ConnectionRecord[]): Promise<void> {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * Safely read a JSON file.
 * On parse failure, back up the corrupted file and return an empty array.
 */
async function safeReadJson(filePath: string): Promise<ConnectionRecord[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw) as ConnectionRecord[];
  } catch {
    // Back up the corrupted file and reset to empty
    const backup = `${filePath}.corrupt_${Date.now()}`;
    await fs.rename(filePath, backup).catch(() => {});
    console.error(`[Store] JSON parse failed for ${filePath}. Backed up to ${backup}. Resetting to empty.`);
    await fs.writeFile(filePath, '[]', 'utf8').catch(() => {});
    return [];
  }
}

/** Whitelist of fields accepted by update() */
const UPDATABLE_FIELDS = new Set(['name', 'host', 'port', 'database', 'user', 'password', 'poolSize']);

/**
 * Initialize the store (create the file if it does not exist)
 */
async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * Get all connection settings (passwords are masked)
 */
export async function getAll(): Promise<MaskedConnectionRecord[]> {
  await ensureStore();
  const connections = await safeReadJson(STORE_FILE);
  return connections.map(({ password, ...rest }) => ({
    ...rest,
    passwordMasked: password ? '••••••••' : ''
  }));
}

/**
 * Get a connection setting by ID (internal use - includes decrypted password)
 */
export async function getById(id: string): Promise<ConnectionRecord | null> {
  await ensureStore();
  const connections = await safeReadJson(STORE_FILE);
  const conn = connections.find(c => c.id === id) || null;
  if (!conn) return null;

  // Decrypt password before returning
  return { ...conn, password: decrypt(conn.password) };
}

/**
 * Create a new connection setting (password is encrypted before storage)
 */
export function create(connection: CreateConnectionInput): Promise<MaskedConnectionRecord> {
  return withLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const connections: ConnectionRecord[] = JSON.parse(raw);

    const newConnection: ConnectionRecord = {
      id:        `conn_${randomUUID()}`,
      name:      connection.name     || `Connection ${connections.length + 1}`,
      host:      connection.host     || 'localhost',
      port:      Number(connection.port) || 3306,
      database:  connection.database || '',
      user:      connection.user     || 'root',
      password:  encrypt(connection.password || ''),  // encrypt before storing
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
 * Update a connection setting (whitelist approach)
 */
export function update(id: string, updates: UpdateConnectionInput): Promise<MaskedConnectionRecord | null> {
  return withLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const connections: ConnectionRecord[] = JSON.parse(raw);

    const index = connections.findIndex(c => c.id === id);
    if (index === -1) return null;

    // Whitelist: only apply allowed fields
    const safeUpdates: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        safeUpdates[field] = (updates as Record<string, unknown>)[field];
      }
    }

    // Ensure numeric types
    if (safeUpdates.port !== undefined) {
      safeUpdates.port = Number(safeUpdates.port) || connections[index].port;
    }
    if (safeUpdates.poolSize !== undefined) {
      safeUpdates.poolSize = Number(safeUpdates.poolSize) || connections[index].poolSize;
    }

    // Encrypt password if it is being updated
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'password')) {
      safeUpdates.password = encrypt((safeUpdates.password as string) || '');
    }

    connections[index] = {
      ...connections[index],
      ...safeUpdates,
      id,  // ID cannot be changed
      updatedAt: new Date().toISOString()
    } as ConnectionRecord;

    await writeAtomic(STORE_FILE, connections);
    const { password, ...rest } = connections[index];
    return { ...rest, passwordMasked: password ? '••••••••' : '' };
  });
}

/**
 * Delete a connection setting
 */
export function remove(id: string): Promise<boolean> {
  return withLock(async () => {
    await ensureStore();
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const connections: ConnectionRecord[] = JSON.parse(raw);

    const index = connections.findIndex(c => c.id === id);
    if (index === -1) return false;

    connections.splice(index, 1);
    await writeAtomic(STORE_FILE, connections);
    return true;
  });
}
