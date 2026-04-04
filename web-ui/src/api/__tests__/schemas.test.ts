import { describe, it, expect } from 'vitest';
import {
  ConnectionSchema,
  ConnectionListSchema,
  ConnectionTestResultSchema,
  SqlItemSchema,
  SqlItemListSchema,
  CategoriesSchema,
  TestIdSchema,
  ReportSummarySchema,
  ReportSummaryListSchema,
  QueryFingerprintSummarySchema,
  QueryEventSchema,
  QueryTimelineSchema,
} from '../schemas/index.js';

describe('API Response Schemas', () => {
  describe('ConnectionSchema', () => {
    it('validates a valid connection', () => {
      const result = ConnectionSchema.safeParse({
        id: 'conn_abc123',
        name: 'Test DB',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        user: 'root',
        passwordMasked: '••••••••',
        poolSize: 10,
      });
      expect(result.success).toBe(true);
    });

    it('accepts extra fields (passthrough)', () => {
      const result = ConnectionSchema.safeParse({
        id: 'conn_abc123',
        name: 'Test DB',
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        user: 'root',
        passwordMasked: '••••••••',
        poolSize: 10,
        extraField: 'ignored',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const result = ConnectionSchema.safeParse({
        id: 'conn_abc123',
        name: 'Test DB',
      });
      expect(result.success).toBe(false);
    });

    it('rejects wrong types', () => {
      const result = ConnectionSchema.safeParse({
        id: 'conn_abc123',
        name: 'Test DB',
        host: 'localhost',
        port: 'not-a-number',
        database: 'testdb',
        user: 'root',
        passwordMasked: '••••••••',
        poolSize: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ConnectionListSchema', () => {
    it('validates an empty array', () => {
      expect(ConnectionListSchema.safeParse([]).success).toBe(true);
    });

    it('validates an array of connections', () => {
      const result = ConnectionListSchema.safeParse([
        { id: 'conn_1', name: 'A', host: 'h', port: 3306, database: 'd', user: 'u', passwordMasked: '', poolSize: 5 },
      ]);
      expect(result.success).toBe(true);
    });
  });

  describe('ConnectionTestResultSchema', () => {
    it('validates a test result', () => {
      const result = ConnectionTestResultSchema.safeParse({
        connected: true,
        serverVersion: '8.0.36',
        supportsExplainAnalyze: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SqlItemSchema', () => {
    it('validates a valid SQL item', () => {
      const result = SqlItemSchema.safeParse({
        id: 'sql_abc',
        name: 'Test Query',
        sql: 'SELECT 1',
        category: 'test',
        description: 'A test query',
        updatedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional tags', () => {
      const result = SqlItemSchema.safeParse({
        id: 'sql_abc',
        name: 'Test',
        sql: 'SELECT 1',
        category: 'test',
        description: '',
        tags: '["perf"]',
        updatedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SqlItemListSchema', () => {
    it('validates an empty array', () => {
      expect(SqlItemListSchema.safeParse([]).success).toBe(true);
    });
  });

  describe('CategoriesSchema', () => {
    it('validates string array', () => {
      expect(CategoriesSchema.safeParse(['perf', 'debug']).success).toBe(true);
    });

    it('rejects non-string items', () => {
      expect(CategoriesSchema.safeParse([1, 2]).success).toBe(false);
    });
  });

  describe('TestIdSchema', () => {
    it('validates test execution response', () => {
      const result = TestIdSchema.safeParse({ testId: 'test_abc-123' });
      expect(result.success).toBe(true);
    });

    it('rejects missing testId', () => {
      expect(TestIdSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('ReportSummarySchema', () => {
    it('validates a report summary', () => {
      const result = ReportSummarySchema.safeParse({
        id: 'test_abc',
        type: 'single',
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional testName', () => {
      const result = ReportSummarySchema.safeParse({
        id: 'test_abc',
        type: 'single',
        testName: 'My Test',
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ReportSummaryListSchema', () => {
    it('validates empty array', () => {
      expect(ReportSummaryListSchema.safeParse([]).success).toBe(true);
    });
  });

  describe('QueryFingerprintSummarySchema', () => {
    it('validates a fingerprint summary', () => {
      const result = QueryFingerprintSummarySchema.safeParse({
        queryFingerprint: 'abc123',
        queryText: 'SELECT 1',
        latestTestName: 'Test',
        runCount: 5,
        latestRunAt: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('QueryEventSchema', () => {
    it('validates a query event', () => {
      const result = QueryEventSchema.safeParse({
        id: 'evt_abc',
        queryFingerprint: '0123456789abcdef',
        label: 'Added index',
        type: 'index_added',
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('QueryTimelineSchema', () => {
    it('validates a timeline response', () => {
      const result = QueryTimelineSchema.safeParse({
        queryFingerprint: '0123456789abcdef',
        queryText: 'SELECT 1',
        entries: [
          {
            testId: 'test_1',
            testName: 'Test',
            timestamp: '2026-01-01T00:00:00Z',
            statistics: { basic: { mean: 1.5 } },
          },
        ],
        events: [],
      });
      expect(result.success).toBe(true);
    });

    it('validates empty entries and events', () => {
      const result = QueryTimelineSchema.safeParse({
        queryFingerprint: '0123456789abcdef',
        queryText: '',
        entries: [],
        events: [],
      });
      expect(result.success).toBe(true);
    });
  });
});
