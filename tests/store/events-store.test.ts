import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb } from '../../web/store/database.js';
import * as store from '../../web/store/events-store.js';

describe('events-store', () => {
  beforeEach(() => {
    resetDb();
    initDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('create', () => {
    it('should create an event with generated ID and timestamps', async () => {
      const result = await store.create({
        queryFingerprint: 'fp_abc123',
        label: 'Added index on users.email',
        type: 'index_added',
      });

      expect(result.id).toMatch(/^evt_/);
      expect(result.queryFingerprint).toBe('fp_abc123');
      expect(result.label).toBe('Added index on users.email');
      expect(result.type).toBe('index_added');
      expect(result.timestamp).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should use provided timestamp', async () => {
      const ts = '2026-01-15T10:00:00Z';
      const result = await store.create({
        queryFingerprint: 'fp_abc',
        label: 'Test',
        type: 'index_added',
        timestamp: ts,
      });
      expect(result.timestamp).toBe(ts);
    });
  });

  describe('listByFingerprint', () => {
    it('should return empty array for unknown fingerprint', async () => {
      const result = await store.listByFingerprint('fp_unknown');
      expect(result).toEqual([]);
    });

    it('should return events for the given fingerprint only', async () => {
      await store.create({ queryFingerprint: 'fp_A', label: 'Event A1', type: 'index_added' });
      await store.create({ queryFingerprint: 'fp_B', label: 'Event B1', type: 'config_changed' });
      await store.create({ queryFingerprint: 'fp_A', label: 'Event A2', type: 'index_removed' });

      const result = await store.listByFingerprint('fp_A');
      expect(result).toHaveLength(2);
      expect(result.every(e => e.queryFingerprint === 'fp_A')).toBe(true);
    });

    it('should return events sorted by timestamp ASC', async () => {
      await store.create({ queryFingerprint: 'fp_X', label: 'Later', type: 'index_added', timestamp: '2026-03-01T00:00:00Z' });
      await store.create({ queryFingerprint: 'fp_X', label: 'Earlier', type: 'index_removed', timestamp: '2026-01-01T00:00:00Z' });

      const result = await store.listByFingerprint('fp_X');
      expect(result[0].label).toBe('Earlier');
      expect(result[1].label).toBe('Later');
    });
  });

  describe('remove', () => {
    it('should return false for non-existent ID', async () => {
      const result = await store.remove('evt_nonexistent');
      expect(result).toBe(false);
    });

    it('should remove an existing event', async () => {
      const created = await store.create({
        queryFingerprint: 'fp_del',
        label: 'To Delete',
        type: 'index_added',
      });

      expect(await store.remove(created.id)).toBe(true);
      const remaining = await store.listByFingerprint('fp_del');
      expect(remaining).toHaveLength(0);
    });
  });
});
