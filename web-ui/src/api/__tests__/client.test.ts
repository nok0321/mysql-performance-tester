/**
 * Tests for the API client module
 *
 * Uses globalThis.fetch mock to verify correct HTTP calls
 * are made without requiring a running backend server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectionsApi, sqlApi, testsApi } from '../../api/client';

function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve({ success: ok, data, error: ok ? undefined : 'Error' }),
  });
}

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('connectionsApi', () => {
    it('list() makes GET /api/connections', async () => {
      const connections = [{ id: '1', name: 'test-db' }];
      globalThis.fetch = mockFetchResponse(connections);

      const result = await connectionsApi.list();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/connections',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(connections);
    });

    it('create() sends POST with body', async () => {
      const newConn = { id: '2', name: 'new-db' };
      globalThis.fetch = mockFetchResponse(newConn);

      const body = {
        name: 'new-db',
        host: 'localhost',
        port: 3306,
        database: 'test',
        user: 'root',
        password: 'pass',
        poolSize: 10,
      };
      const result = await connectionsApi.create(body);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/connections',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
      expect(result).toEqual(newConn);
    });
  });

  describe('sqlApi', () => {
    it('list() with filters builds correct query params', async () => {
      const items = [{ id: '1', name: 'select-test' }];
      globalThis.fetch = mockFetchResponse(items);

      await sqlApi.list({ category: 'performance', keyword: 'select' });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/sql?');
      expect(calledUrl).toContain('category=performance');
      expect(calledUrl).toContain('keyword=select');
    });

    it('list() without filters calls /api/sql without query params', async () => {
      globalThis.fetch = mockFetchResponse([]);

      await sqlApi.list();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sql',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('list() omits empty/null/undefined filter values', async () => {
      globalThis.fetch = mockFetchResponse([]);

      await sqlApi.list({ category: '', keyword: undefined });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/sql',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('testsApi', () => {
    it('runSingle() sends POST /api/tests/single', async () => {
      const response = { testId: 'abc-123' };
      globalThis.fetch = mockFetchResponse(response);

      const body = { connectionId: '1', sqlText: 'SELECT 1', testIterations: 10 };
      const result = await testsApi.runSingle(body);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tests/single',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
      expect(result).toEqual(response);
    });
  });

  describe('error handling', () => {
    it('throws when response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false, data: null, error: 'Internal server error' }),
      });

      await expect(connectionsApi.list()).rejects.toThrow('Internal server error');
    });

    it('throws with HTTP status when no error message provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ success: false, data: null }),
      });

      await expect(connectionsApi.list()).rejects.toThrow('HTTP 404');
    });
  });
});
