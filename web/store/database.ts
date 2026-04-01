/**
 * database.ts - SQLite initialization, schema creation, and JSON migration
 *
 * Uses better-sqlite3 (synchronous API) for the web server's persistence layer.
 * Replaces three JSON file stores (connections, sql-library, query-events).
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, 'store.db');

let _db: DatabaseType | null = null;

/**
 * Create tables if they do not exist.
 */
function createTables(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      host       TEXT NOT NULL DEFAULT 'localhost',
      port       INTEGER NOT NULL DEFAULT 3306,
      database_  TEXT NOT NULL DEFAULT '',
      user_      TEXT NOT NULL DEFAULT 'root',
      password   TEXT NOT NULL DEFAULT '',
      pool_size  INTEGER NOT NULL DEFAULT 10,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sql_items (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      sql         TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'SELECT',
      description TEXT NOT NULL DEFAULT '',
      tags        TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS query_events (
      id                TEXT PRIMARY KEY,
      query_fingerprint TEXT NOT NULL,
      label             TEXT NOT NULL,
      type              TEXT NOT NULL,
      timestamp         TEXT NOT NULL,
      created_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_query_events_fingerprint
      ON query_events (query_fingerprint);
  `);

  // Initialize schema version if not set
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?)').run('schema_version', '1');
  }
}

interface JsonConnectionRecord {
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

interface JsonSqlRecord {
  id: string;
  name: string;
  sql: string;
  category: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface JsonQueryEvent {
  id: string;
  queryFingerprint: string;
  label: string;
  type: string;
  timestamp: string;
  createdAt: string;
}

/**
 * Migrate existing JSON files into SQLite (runs once on first startup).
 */
function migrateFromJson(db: DatabaseType, dataDir: string): void {
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('json_migrated') as { value: string } | undefined;
  if (row?.value === 'true') return;

  let totalConnections = 0;
  let totalSql = 0;
  let totalEvents = 0;

  // --- connections.json ---
  const connectionsFile = path.join(dataDir, 'connections.json');
  if (fs.existsSync(connectionsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(connectionsFile, 'utf8')) as JsonConnectionRecord[];
      if (Array.isArray(data) && data.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO connections (id, name, host, port, database_, user_, password, pool_size, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const migrate = db.transaction((records: JsonConnectionRecord[]) => {
          for (const r of records) {
            insert.run(r.id, r.name, r.host, r.port, r.database, r.user, r.password, r.poolSize, r.createdAt, r.updatedAt);
          }
        });
        migrate(data);
        totalConnections = data.length;
      }
      fs.renameSync(connectionsFile, connectionsFile + '.migrated');
    } catch (err) {
      console.error('[Database] Failed to migrate connections.json:', (err as Error).message);
    }
  }

  // --- sql-library.json ---
  const sqlFile = path.join(dataDir, 'sql-library.json');
  if (fs.existsSync(sqlFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(sqlFile, 'utf8')) as JsonSqlRecord[];
      if (Array.isArray(data) && data.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO sql_items (id, name, sql, category, description, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const migrate = db.transaction((records: JsonSqlRecord[]) => {
          for (const r of records) {
            insert.run(r.id, r.name, r.sql, r.category, r.description, JSON.stringify(r.tags || []), r.createdAt, r.updatedAt);
          }
        });
        migrate(data);
        totalSql = data.length;
      }
      fs.renameSync(sqlFile, sqlFile + '.migrated');
    } catch (err) {
      console.error('[Database] Failed to migrate sql-library.json:', (err as Error).message);
    }
  }

  // --- query-events.json ---
  const eventsFile = path.join(dataDir, 'query-events.json');
  if (fs.existsSync(eventsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(eventsFile, 'utf8')) as JsonQueryEvent[];
      if (Array.isArray(data) && data.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO query_events (id, query_fingerprint, label, type, timestamp, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const migrate = db.transaction((records: JsonQueryEvent[]) => {
          for (const r of records) {
            insert.run(r.id, r.queryFingerprint, r.label, r.type, r.timestamp, r.createdAt);
          }
        });
        migrate(data);
        totalEvents = data.length;
      }
      fs.renameSync(eventsFile, eventsFile + '.migrated');
    } catch (err) {
      console.error('[Database] Failed to migrate query-events.json:', (err as Error).message);
    }
  }

  // Mark migration as done
  db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run('json_migrated', 'true');

  const total = totalConnections + totalSql + totalEvents;
  if (total > 0) {
    console.log(`[Database] Migrated from JSON: ${totalConnections} connections, ${totalSql} SQL items, ${totalEvents} events`);
  }
}

/**
 * Initialize the SQLite database.
 * @param dbPath - Optional path override (use ':memory:' for tests)
 * @param dataDir - Optional data directory override (for migration source)
 */
export function initDb(dbPath?: string, dataDir?: string): DatabaseType {
  if (_db) return _db;

  const resolvedPath = dbPath ?? DEFAULT_DB_PATH;
  const resolvedDataDir = dataDir ?? DEFAULT_DATA_DIR;

  // Ensure data directory exists (not needed for :memory:)
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);

  // Performance and safety pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  createTables(db);
  migrateFromJson(db, resolvedDataDir);

  _db = db;
  return db;
}

/**
 * Get the active database instance (initializes with defaults if needed).
 */
export function getDb(): DatabaseType {
  if (!_db) {
    return initDb();
  }
  return _db;
}

/**
 * Close the database connection and reset the singleton.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Reset the singleton (for tests that need to reinitialize).
 */
export function resetDb(): void {
  closeDb();
}
