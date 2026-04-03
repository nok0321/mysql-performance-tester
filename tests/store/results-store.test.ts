import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb } from '../../web/store/database.js';
import * as store from '../../web/store/results-store.js';

describe('results-store', () => {
  beforeEach(() => {
    resetDb();
    initDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  // ─── Helper ───────────────────────────────────────────────────────────
  function createSingleResult(overrides: Partial<store.ResultInput> = {}) {
    return store.create({
      id: `test_${Math.random().toString(36).slice(2, 10)}`,
      type: 'single',
      testName: 'Test Query',
      queryFingerprint: 'abcdef0123456789',
      queryNormalized: 'SELECT * FROM users WHERE status = ?',
      queryText: "SELECT * FROM users WHERE status = 'active'",
      filePath: 'test_abc.json',
      fileSize: 1024,
      statistics: {
        count: { total: 20, included: 18, outliers: 2 },
        basic: { min: 1.2, max: 15.3, mean: 5.5, median: 4.8, sum: 99.0 },
        spread: { range: 14.1, variance: 12.5, stdDev: 3.54, cv: 0.64, iqr: 4.2 },
        percentiles: { p01: 1.2, p05: 1.5, p10: 2.0, p25: 3.0, p50: 4.8, p75: 7.2, p90: 10.1, p95: 12.5, p99: 14.8, p999: 15.2 },
      },
      explainAccessType: 'ALL',
      ...overrides,
    });
  }

  // ─── create ───────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a result record and return it', () => {
      const result = createSingleResult({ id: 'test_create_01' });

      expect(result.id).toBe('test_create_01');
      expect(result.type).toBe('single');
      expect(result.testName).toBe('Test Query');
      expect(result.queryFingerprint).toBe('abcdef0123456789');
      expect(result.queryNormalized).toBe('SELECT * FROM users WHERE status = ?');
      expect(result.queryText).toBe("SELECT * FROM users WHERE status = 'active'");
      expect(result.filePath).toBe('test_abc.json');
      expect(result.fileSize).toBe(1024);
      expect(result.explainAccessType).toBe('ALL');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should store and retrieve statistics as JSON', () => {
      const result = createSingleResult({ id: 'test_stats_01' });

      expect(result.statistics).toBeDefined();
      expect(result.statistics!.basic.mean).toBe(5.5);
      expect(result.statistics!.percentiles.p99).toBe(14.8);
      expect(result.statistics!.count.total).toBe(20);
    });

    it('should handle null optional fields', () => {
      const result = store.create({
        id: 'parallel_null_01',
        type: 'parallel',
        testName: 'Parallel Test',
        filePath: 'parallel_null_01.json',
        fileSize: 512,
      });

      expect(result.queryFingerprint).toBeNull();
      expect(result.queryNormalized).toBeNull();
      expect(result.queryText).toBeNull();
      expect(result.statistics).toBeNull();
      expect(result.explainAccessType).toBeNull();
    });

    it('should use provided createdAt timestamp', () => {
      const ts = '2026-01-15T10:00:00Z';
      const result = createSingleResult({ id: 'test_ts_01', createdAt: ts });
      expect(result.createdAt).toBe(ts);
    });

    it('should upsert on duplicate ID (INSERT OR REPLACE)', () => {
      createSingleResult({ id: 'test_upsert_01', testName: 'Original' });
      const updated = createSingleResult({ id: 'test_upsert_01', testName: 'Updated' });

      expect(updated.testName).toBe('Updated');
      const { total } = store.getAll();
      expect(total).toBe(1);
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return null for non-existent ID', () => {
      expect(store.getById('test_nonexistent')).toBeNull();
    });

    it('should return the correct record', () => {
      createSingleResult({ id: 'test_getbyid_01' });
      const result = store.getById('test_getbyid_01');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('test_getbyid_01');
      expect(result!.type).toBe('single');
    });
  });

  // ─── getAll ───────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return empty result when no records exist', () => {
      const { data, total } = store.getAll();
      expect(data).toEqual([]);
      expect(total).toBe(0);
    });

    it('should return all records sorted by created_at DESC', () => {
      createSingleResult({ id: 'test_all_01', createdAt: '2026-01-01T00:00:00Z' });
      createSingleResult({ id: 'test_all_02', createdAt: '2026-03-01T00:00:00Z' });
      createSingleResult({ id: 'test_all_03', createdAt: '2026-02-01T00:00:00Z' });

      const { data, total } = store.getAll();
      expect(total).toBe(3);
      expect(data[0].id).toBe('test_all_02'); // latest first
      expect(data[1].id).toBe('test_all_03');
      expect(data[2].id).toBe('test_all_01');
    });

    it('should filter by type', () => {
      createSingleResult({ id: 'test_filter_01', type: 'single' });
      store.create({ id: 'parallel_filter_01', type: 'parallel', testName: 'P', filePath: 'p.json', fileSize: 100 });

      const { data, total } = store.getAll({ type: 'single' });
      expect(total).toBe(1);
      expect(data[0].type).toBe('single');
    });

    it('should paginate results', () => {
      for (let i = 0; i < 5; i++) {
        createSingleResult({ id: `test_page_${i}`, createdAt: `2026-01-0${i + 1}T00:00:00Z` });
      }

      const page1 = store.getAll({ page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = store.getAll({ page: 2, limit: 2 });
      expect(page2.data).toHaveLength(2);

      const page3 = store.getAll({ page: 3, limit: 2 });
      expect(page3.data).toHaveLength(1);
    });

    it('should sort ASC when specified', () => {
      createSingleResult({ id: 'test_asc_01', createdAt: '2026-01-01T00:00:00Z' });
      createSingleResult({ id: 'test_asc_02', createdAt: '2026-03-01T00:00:00Z' });

      const { data } = store.getAll({ sort: 'asc' });
      expect(data[0].id).toBe('test_asc_01'); // oldest first
      expect(data[1].id).toBe('test_asc_02');
    });
  });

  // ─── getByFingerprint ─────────────────────────────────────────────────

  describe('getByFingerprint', () => {
    it('should return empty array for unknown fingerprint', () => {
      const result = store.getByFingerprint('unknown_fp_000000');
      expect(result).toEqual([]);
    });

    it('should return only records matching the fingerprint', () => {
      createSingleResult({ id: 'test_fp_01', queryFingerprint: 'fp_aaaa' });
      createSingleResult({ id: 'test_fp_02', queryFingerprint: 'fp_bbbb' });
      createSingleResult({ id: 'test_fp_03', queryFingerprint: 'fp_aaaa' });

      const result = store.getByFingerprint('fp_aaaa');
      expect(result).toHaveLength(2);
      expect(result.every(r => r.queryFingerprint === 'fp_aaaa')).toBe(true);
    });

    it('should return records sorted by created_at ASC', () => {
      createSingleResult({ id: 'test_fpsort_01', queryFingerprint: 'fp_sort', createdAt: '2026-03-01T00:00:00Z' });
      createSingleResult({ id: 'test_fpsort_02', queryFingerprint: 'fp_sort', createdAt: '2026-01-01T00:00:00Z' });

      const result = store.getByFingerprint('fp_sort');
      expect(result[0].id).toBe('test_fpsort_02'); // earlier first
      expect(result[1].id).toBe('test_fpsort_01');
    });
  });

  // ─── getFingerprints ──────────────────────────────────────────────────

  describe('getFingerprints', () => {
    it('should return empty result when no records exist', () => {
      const { data, total } = store.getFingerprints();
      expect(data).toEqual([]);
      expect(total).toBe(0);
    });

    it('should group by fingerprint with correct counts', () => {
      createSingleResult({ id: 'test_grp_01', queryFingerprint: 'fp_group_a', testName: 'Query A' });
      createSingleResult({ id: 'test_grp_02', queryFingerprint: 'fp_group_a', testName: 'Query A v2' });
      createSingleResult({ id: 'test_grp_03', queryFingerprint: 'fp_group_b', testName: 'Query B' });

      const { data, total } = store.getFingerprints();
      expect(total).toBe(2);
      expect(data).toHaveLength(2);

      const fpA = data.find(d => d.queryFingerprint === 'fp_group_a');
      const fpB = data.find(d => d.queryFingerprint === 'fp_group_b');
      expect(fpA!.runCount).toBe(2);
      expect(fpB!.runCount).toBe(1);
    });

    it('should exclude records without fingerprint', () => {
      createSingleResult({ id: 'test_nofp_01', queryFingerprint: 'fp_has' });
      store.create({ id: 'parallel_nofp_01', type: 'parallel', testName: 'P', filePath: 'p.json', fileSize: 100 });

      const { total } = store.getFingerprints();
      expect(total).toBe(1);
    });

    it('should paginate fingerprints', () => {
      for (let i = 0; i < 5; i++) {
        createSingleResult({
          id: `test_fppg_${i}`,
          queryFingerprint: `fp_page_${i}`,
          createdAt: `2026-01-0${i + 1}T00:00:00Z`,
        });
      }

      const page1 = store.getFingerprints({ page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = store.getFingerprints({ page: 2, limit: 2 });
      expect(page2.data).toHaveLength(2);
    });

    it('should return latest testName and queryText', () => {
      createSingleResult({
        id: 'test_latest_01',
        queryFingerprint: 'fp_latest',
        testName: 'Old Name',
        queryText: 'SELECT 1',
        createdAt: '2026-01-01T00:00:00Z',
      });
      createSingleResult({
        id: 'test_latest_02',
        queryFingerprint: 'fp_latest',
        testName: 'New Name',
        queryText: 'SELECT 2',
        createdAt: '2026-03-01T00:00:00Z',
      });

      const { data } = store.getFingerprints();
      const fp = data.find(d => d.queryFingerprint === 'fp_latest')!;
      expect(fp.latestTestName).toBe('New Name');
      expect(fp.queryText).toBe('SELECT 2');
      expect(fp.latestRunAt).toBe('2026-03-01T00:00:00Z');
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should return false for non-existent ID', () => {
      expect(store.remove('test_nonexistent')).toBe(false);
    });

    it('should remove an existing record', () => {
      createSingleResult({ id: 'test_rm_01' });
      expect(store.remove('test_rm_01')).toBe(true);
      expect(store.getById('test_rm_01')).toBeNull();
    });

    it('should not affect other records', () => {
      createSingleResult({ id: 'test_rm_keep' });
      createSingleResult({ id: 'test_rm_delete' });

      store.remove('test_rm_delete');

      expect(store.getById('test_rm_keep')).not.toBeNull();
      const { total } = store.getAll();
      expect(total).toBe(1);
    });
  });
});
