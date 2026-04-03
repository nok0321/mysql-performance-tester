/**
 * ResultsStore - SQLite persistence for test result metadata
 *
 * Stores metadata from performance_results/ JSON files so that
 * listing and filtering does not require a full disk scan on every request.
 * The actual result data is still read from disk when needed.
 */

import { getDb } from './database.js';
import type { StatisticsResult } from '../../lib/types/index.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ResultRecord {
  id: string;
  type: string;
  testName: string;
  queryFingerprint: string | null;
  queryNormalized: string | null;
  queryText: string | null;
  filePath: string;
  fileSize: number;
  statistics: StatisticsResult | null;
  explainAccessType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResultInput {
  id: string;
  type: string;
  testName: string;
  queryFingerprint?: string | null;
  queryNormalized?: string | null;
  queryText?: string | null;
  filePath: string;
  fileSize: number;
  statistics?: StatisticsResult | null;
  explainAccessType?: string | null;
  createdAt?: string;
}

export interface FingerprintSummary {
  queryFingerprint: string;
  queryText: string;
  latestTestName: string;
  runCount: number;
  latestRunAt: string;
}

export interface ListOptions {
  type?: string;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

/** SQLite row shape */
interface ResultRow {
  id: string;
  type: string;
  test_name: string;
  query_fingerprint: string | null;
  query_normalized: string | null;
  query_text: string | null;
  file_path: string;
  file_size: number;
  statistics_json: string | null;
  explain_access_type: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function rowToRecord(row: ResultRow): ResultRecord {
  let statistics: StatisticsResult | null = null;
  if (row.statistics_json) {
    try {
      statistics = JSON.parse(row.statistics_json) as StatisticsResult;
    } catch { /* ignore malformed JSON */ }
  }

  return {
    id:                row.id,
    type:              row.type,
    testName:          row.test_name,
    queryFingerprint:  row.query_fingerprint,
    queryNormalized:   row.query_normalized,
    queryText:         row.query_text,
    filePath:          row.file_path,
    fileSize:          row.file_size,
    statistics,
    explainAccessType: row.explain_access_type,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * List all result metadata with optional filtering and pagination.
 */
export function getAll(options: ListOptions = {}): { data: ResultRecord[]; total: number } {
  const db = getDb();
  const { type, page = 1, limit = 50, sort = 'desc' } = options;
  const offset = (page - 1) * limit;
  const direction = sort === 'asc' ? 'ASC' : 'DESC';

  let whereClause = '';
  const params: unknown[] = [];

  if (type) {
    whereClause = 'WHERE type = ?';
    params.push(type);
  }

  const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM test_results ${whereClause}`).get(...params) as { cnt: number };

  const rows = db.prepare(
    `SELECT * FROM test_results ${whereClause} ORDER BY created_at ${direction} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ResultRow[];

  return { data: rows.map(rowToRecord), total: countRow.cnt };
}

/**
 * Get all results matching a query fingerprint (for history timeline).
 */
export function getByFingerprint(fingerprint: string): ResultRecord[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM test_results WHERE query_fingerprint = ? ORDER BY created_at ASC'
  ).all(fingerprint) as ResultRow[];
  return rows.map(rowToRecord);
}

/**
 * List distinct query fingerprints with summary statistics.
 */
export function getFingerprints(options: { page?: number; limit?: number } = {}): { data: FingerprintSummary[]; total: number } {
  const db = getDb();
  const { page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  const countRow = db.prepare(
    'SELECT COUNT(DISTINCT query_fingerprint) AS cnt FROM test_results WHERE query_fingerprint IS NOT NULL'
  ).get() as { cnt: number };

  const rows = db.prepare(`
    SELECT
      query_fingerprint,
      query_text,
      test_name,
      created_at,
      COUNT(*) AS run_count
    FROM test_results
    WHERE query_fingerprint IS NOT NULL
    GROUP BY query_fingerprint
    ORDER BY MAX(created_at) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{
    query_fingerprint: string;
    query_text: string | null;
    test_name: string;
    created_at: string;
    run_count: number;
  }>;

  // For each fingerprint, get the latest entry's details
  const getLatest = db.prepare(`
    SELECT test_name, query_text, created_at
    FROM test_results
    WHERE query_fingerprint = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const data: FingerprintSummary[] = rows.map(row => {
    const latest = getLatest.get(row.query_fingerprint) as {
      test_name: string;
      query_text: string | null;
      created_at: string;
    } | undefined;

    return {
      queryFingerprint: row.query_fingerprint,
      queryText: latest?.query_text || row.query_text || '',
      latestTestName: latest?.test_name || row.test_name,
      runCount: row.run_count,
      latestRunAt: latest?.created_at || row.created_at,
    };
  });

  return { data, total: countRow.cnt };
}

/**
 * Get a single result by ID.
 */
export function getById(id: string): ResultRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM test_results WHERE id = ?').get(id) as ResultRow | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

/**
 * Register a new test result (called after saving the JSON file).
 */
export function create(input: ResultInput): ResultRecord {
  const db = getDb();
  const now = input.createdAt || new Date().toISOString();
  const statisticsJson = input.statistics ? JSON.stringify(input.statistics) : null;

  db.prepare(`
    INSERT OR REPLACE INTO test_results
      (id, type, test_name, query_fingerprint, query_normalized, query_text, file_path, file_size, statistics_json, explain_access_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.type,
    input.testName,
    input.queryFingerprint || null,
    input.queryNormalized || null,
    input.queryText || null,
    input.filePath,
    input.fileSize,
    statisticsJson,
    input.explainAccessType || null,
    now,
    now,
  );

  return getById(input.id)!;
}

/**
 * Delete a result record.
 */
export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM test_results WHERE id = ?').run(id);
  return result.changes > 0;
}
