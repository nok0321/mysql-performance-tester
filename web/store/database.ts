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

    CREATE TABLE IF NOT EXISTS test_results (
      id                  TEXT PRIMARY KEY,
      type                TEXT NOT NULL DEFAULT 'single',
      test_name           TEXT NOT NULL DEFAULT '',
      query_fingerprint   TEXT,
      query_normalized    TEXT,
      query_text          TEXT,
      file_path           TEXT NOT NULL,
      file_size           INTEGER DEFAULT 0,
      statistics_json     TEXT,
      explain_access_type TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_test_results_fingerprint
      ON test_results (query_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_test_results_type
      ON test_results (type);
    CREATE INDEX IF NOT EXISTS idx_test_results_created
      ON test_results (created_at);
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
 * Sync existing performance_results/ JSON files into the test_results table.
 * Called on every startup to catch files created outside the Web UI (e.g., CLI).
 * Uses INSERT OR IGNORE to skip already-registered files.
 */
export function syncResultsFromDisk(db: DatabaseType, resultsDir: string): number {
  if (!fs.existsSync(resultsDir)) return 0;

  const entries = fs.readdirSync(resultsDir, { withFileTypes: true });
  const insert = db.prepare(`
    INSERT OR IGNORE INTO test_results
      (id, type, test_name, query_fingerprint, query_normalized, query_text, file_path, file_size, statistics_json, explain_access_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let synced = 0;

  const syncAll = db.transaction(() => {
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Batch result directory
        const batchFile = path.join(resultsDir, entry.name, 'results.json');
        if (!fs.existsSync(batchFile)) continue;
        try {
          const stat = fs.statSync(batchFile);
          const now = stat.mtime.toISOString();
          const r = insert.run(entry.name, 'batch', entry.name, null, null, null, `${entry.name}/results.json`, stat.size, null, null, now, now);
          if (r.changes > 0) synced++;
        } catch { /* skip malformed */ }
      } else if (entry.name.endsWith('.json')) {
        const id = entry.name.replace('.json', '');
        let type = 'single';
        if (entry.name.startsWith('parallel_')) type = 'parallel';
        else if (entry.name.startsWith('comparison_')) type = 'comparison';
        else if (!entry.name.startsWith('test_')) continue;

        try {
          const filePath = path.join(resultsDir, entry.name);
          const stat = fs.statSync(filePath);
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw) as Record<string, unknown>;

          const testName = (data.testName as string) || (data.testId as string) || '';
          const queryFingerprint = (data.queryFingerprint as string) || null;
          const queryNormalized = (data.queryNormalized as string) || null;

          // Extract query text and statistics from result
          const result = data.result as Record<string, unknown> | undefined;
          const queryText = (result?.query as string) || null;
          const statistics = result?.statistics ? JSON.stringify(result.statistics) : null;

          // Extract EXPLAIN access type
          let explainAccessType: string | null = null;
          try {
            const explainData = (result?.explainAnalyze as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
            if (explainData?.query_block) {
              const qb = explainData.query_block as Record<string, unknown>;
              const table = qb.table as Record<string, unknown> | undefined;
              if (table?.access_type) explainAccessType = String(table.access_type);
            }
          } catch { /* ignore */ }

          const now = stat.mtime.toISOString();
          const r = insert.run(id, type, testName, queryFingerprint, queryNormalized, queryText, entry.name, stat.size, statistics, explainAccessType, now, now);
          if (r.changes > 0) synced++;
        } catch { /* skip malformed */ }
      }
    }
  });

  syncAll();

  if (synced > 0) {
    console.log(`[Database] Synced ${synced} result file(s) from disk`);
  }
  return synced;
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

  // Sync performance_results/ into test_results table
  const resultsDir = path.resolve(path.dirname(resolvedDataDir), 'performance_results');
  syncResultsFromDisk(db, resultsDir);

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
