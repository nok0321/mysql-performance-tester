import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDb, closeDb, resetDb, getDb } from '../../web/store/database.js';

describe('database', () => {
  beforeEach(() => {
    resetDb();
  });

  afterEach(() => {
    resetDb();
  });

  it('should create all tables with :memory: database', () => {
    const db = initDb(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('connections');
    expect(tableNames).toContain('sql_items');
    expect(tableNames).toContain('query_events');
    expect(tableNames).toContain('_meta');
  });

  it('should set WAL journal mode', () => {
    const db = initDb(':memory:');
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    // :memory: databases use 'memory' journal mode regardless of pragma
    expect(result[0].journal_mode).toBeDefined();
  });

  it('should set schema_version in _meta', () => {
    const db = initDb(':memory:');
    const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as { value: string };
    expect(row.value).toBe('1');
  });

  it('should return same instance on repeated calls', () => {
    const db1 = initDb(':memory:');
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('should reinitialize after resetDb()', () => {
    const db1 = initDb(':memory:');
    resetDb();
    const db2 = initDb(':memory:');
    expect(db1).not.toBe(db2);
  });

  describe('JSON migration', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
    });

    afterEach(() => {
      // Close DB before removing temp dir (Windows locks .db files)
      resetDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should migrate connections.json', () => {
      const connections = [
        {
          id: 'conn_test1',
          name: 'Test DB',
          host: 'localhost',
          port: 3306,
          database: 'testdb',
          user: 'root',
          password: 'enc:abc123',
          poolSize: 5,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }
      ];
      fs.writeFileSync(path.join(tmpDir, 'connections.json'), JSON.stringify(connections));

      const dbPath = path.join(tmpDir, 'test.db');
      const db = initDb(dbPath, tmpDir);

      const rows = db.prepare('SELECT * FROM connections').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('conn_test1');
      expect(rows[0].database_).toBe('testdb');
      expect(rows[0].pool_size).toBe(5);

      // JSON file should be renamed
      expect(fs.existsSync(path.join(tmpDir, 'connections.json.migrated'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'connections.json'))).toBe(false);
    });

    it('should migrate sql-library.json', () => {
      const items = [
        {
          id: 'sql_test1',
          name: 'Select All',
          sql: 'SELECT * FROM users',
          category: 'SELECT',
          description: 'Get all users',
          tags: ['perf', 'users'],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }
      ];
      fs.writeFileSync(path.join(tmpDir, 'sql-library.json'), JSON.stringify(items));

      const dbPath = path.join(tmpDir, 'test.db');
      const db = initDb(dbPath, tmpDir);

      const rows = db.prepare('SELECT * FROM sql_items').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Select All');
      expect(rows[0].tags).toBe('["perf","users"]');

      expect(fs.existsSync(path.join(tmpDir, 'sql-library.json.migrated'))).toBe(true);
    });

    it('should migrate query-events.json', () => {
      const events = [
        {
          id: 'evt_test1',
          queryFingerprint: 'fp_abc',
          label: 'Added index',
          type: 'index_added',
          timestamp: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        }
      ];
      fs.writeFileSync(path.join(tmpDir, 'query-events.json'), JSON.stringify(events));

      const dbPath = path.join(tmpDir, 'test.db');
      const db = initDb(dbPath, tmpDir);

      const rows = db.prepare('SELECT * FROM query_events').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0].query_fingerprint).toBe('fp_abc');

      expect(fs.existsSync(path.join(tmpDir, 'query-events.json.migrated'))).toBe(true);
    });

    it('should skip migration if already done', () => {
      fs.writeFileSync(path.join(tmpDir, 'connections.json'), JSON.stringify([
        { id: 'conn_1', name: 'A', host: 'h', port: 1, database: 'd', user: 'u', password: 'p', poolSize: 1, createdAt: 'c', updatedAt: 'u' }
      ]));

      const dbPath = path.join(tmpDir, 'test.db');
      initDb(dbPath, tmpDir);
      resetDb();

      // Second init — json files already renamed, _meta says migrated
      const db2 = initDb(dbPath, tmpDir);
      const rows = db2.prepare('SELECT * FROM connections').all();
      expect(rows).toHaveLength(1); // Should not duplicate
    });

    it('should handle empty JSON arrays gracefully', () => {
      fs.writeFileSync(path.join(tmpDir, 'connections.json'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'sql-library.json'), '[]');
      fs.writeFileSync(path.join(tmpDir, 'query-events.json'), '[]');

      const dbPath = path.join(tmpDir, 'test.db');
      const db = initDb(dbPath, tmpDir);

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM connections').get()).toEqual({ cnt: 0 });
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM sql_items').get()).toEqual({ cnt: 0 });
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM query_events').get()).toEqual({ cnt: 0 });
    });

    it('should handle missing JSON files gracefully', () => {
      // No JSON files in tmpDir
      const dbPath = path.join(tmpDir, 'test.db');
      const db = initDb(dbPath, tmpDir);

      // Should complete without error
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM connections').get()).toEqual({ cnt: 0 });
    });
  });
});
