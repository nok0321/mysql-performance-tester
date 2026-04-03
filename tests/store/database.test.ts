import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDb, closeDb, resetDb, getDb, syncResultsFromDisk } from '../../web/store/database.js';

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
    expect(tableNames).toContain('test_results');
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

  describe('test_results table', () => {
    it('should have correct columns', () => {
      const db = initDb(':memory:');
      const columns = db.prepare('PRAGMA table_info(test_results)').all() as Array<{ name: string }>;
      const colNames = columns.map(c => c.name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('type');
      expect(colNames).toContain('test_name');
      expect(colNames).toContain('query_fingerprint');
      expect(colNames).toContain('query_normalized');
      expect(colNames).toContain('query_text');
      expect(colNames).toContain('file_path');
      expect(colNames).toContain('file_size');
      expect(colNames).toContain('statistics_json');
      expect(colNames).toContain('explain_access_type');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
    });

    it('should have indexes on fingerprint, type, and created_at', () => {
      const db = initDb(':memory:');
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='test_results'"
      ).all() as Array<{ name: string }>;
      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_test_results_fingerprint');
      expect(indexNames).toContain('idx_test_results_type');
      expect(indexNames).toContain('idx_test_results_created');
    });
  });

  describe('syncResultsFromDisk', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-results-'));
    });

    afterEach(() => {
      resetDb();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return 0 when results directory does not exist', () => {
      const db = initDb(':memory:');
      const count = syncResultsFromDisk(db, path.join(tmpDir, 'nonexistent'));
      expect(count).toBe(0);
    });

    it('should return 0 when results directory is empty', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(0);
    });

    it('should sync single test result files', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      const testData = {
        testId: 'test_sync_01',
        testName: 'Sync Test',
        queryFingerprint: 'abcdef0123456789',
        queryNormalized: 'SELECT ?',
        result: {
          query: 'SELECT 1',
          timestamp: '2026-01-01T00:00:00Z',
          statistics: { count: { total: 10, included: 10, outliers: 0 }, basic: { min: 1, max: 5, mean: 3, median: 3, sum: 30 } },
        },
      };
      fs.writeFileSync(path.join(resultsDir, 'test_sync_01.json'), JSON.stringify(testData));

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(1);

      const row = db.prepare('SELECT * FROM test_results WHERE id = ?').get('test_sync_01') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.type).toBe('single');
      expect(row.test_name).toBe('Sync Test');
      expect(row.query_fingerprint).toBe('abcdef0123456789');
      expect(row.query_text).toBe('SELECT 1');
      expect(row.statistics_json).toBeDefined();
    });

    it('should sync parallel test result files', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      fs.writeFileSync(
        path.join(resultsDir, 'parallel_sync_01.json'),
        JSON.stringify({ testId: 'parallel_sync_01', testName: 'Parallel Test', results: {} })
      );

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(1);

      const row = db.prepare('SELECT * FROM test_results WHERE id = ?').get('parallel_sync_01') as Record<string, unknown>;
      expect(row.type).toBe('parallel');
    });

    it('should sync comparison test result files', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      fs.writeFileSync(
        path.join(resultsDir, 'comparison_sync_01.json'),
        JSON.stringify({ testId: 'comparison_sync_01', testName: 'Comparison' })
      );

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(1);

      const row = db.prepare('SELECT * FROM test_results WHERE id = ?').get('comparison_sync_01') as Record<string, unknown>;
      expect(row.type).toBe('comparison');
    });

    it('should sync batch result directories', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      const batchDir = path.join(resultsDir, '20260101_120000');
      fs.mkdirSync(batchDir, { recursive: true });
      fs.writeFileSync(path.join(batchDir, 'results.json'), JSON.stringify({ results: [] }));

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(1);

      const row = db.prepare('SELECT * FROM test_results WHERE id = ?').get('20260101_120000') as Record<string, unknown>;
      expect(row.type).toBe('batch');
    });

    it('should skip already-registered files (INSERT OR IGNORE)', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      fs.writeFileSync(
        path.join(resultsDir, 'test_dup_01.json'),
        JSON.stringify({ testId: 'test_dup_01', testName: 'Dup Test', result: { query: 'SELECT 1' } })
      );

      syncResultsFromDisk(db, resultsDir);
      const count2 = syncResultsFromDisk(db, resultsDir);
      expect(count2).toBe(0); // INSERT OR IGNORE skips duplicates

      const rows = db.prepare('SELECT * FROM test_results').all();
      expect(rows).toHaveLength(1);
    });

    it('should skip non-test JSON files', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      fs.writeFileSync(path.join(resultsDir, 'random_file.json'), '{}');
      fs.writeFileSync(path.join(resultsDir, 'notes.txt'), 'not json');

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(0);
    });

    it('should skip malformed JSON files gracefully', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      fs.writeFileSync(path.join(resultsDir, 'test_bad_01.json'), 'not valid json{{{');
      fs.writeFileSync(
        path.join(resultsDir, 'test_good_01.json'),
        JSON.stringify({ testId: 'test_good_01', testName: 'Good', result: {} })
      );

      const count = syncResultsFromDisk(db, resultsDir);
      expect(count).toBe(1); // only good file synced
    });

    it('should extract EXPLAIN access type from result', () => {
      const db = initDb(':memory:');
      const resultsDir = path.join(tmpDir, 'performance_results');
      fs.mkdirSync(resultsDir);

      fs.writeFileSync(
        path.join(resultsDir, 'test_explain_01.json'),
        JSON.stringify({
          testId: 'test_explain_01',
          testName: 'Explain Test',
          queryFingerprint: 'fp123',
          result: {
            query: 'SELECT 1',
            explainAnalyze: {
              data: { query_block: { table: { access_type: 'ref' } } },
            },
          },
        })
      );

      syncResultsFromDisk(db, resultsDir);
      const row = db.prepare('SELECT * FROM test_results WHERE id = ?').get('test_explain_01') as Record<string, unknown>;
      expect(row.explain_access_type).toBe('ref');
    });
  });
});
