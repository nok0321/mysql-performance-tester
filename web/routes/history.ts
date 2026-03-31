/**
 * history.ts - Query history routes
 *
 * GET  /api/history/fingerprints             -- List distinct query fingerprints
 * GET  /api/history/:fingerprint             -- Timeline for a single query
 * GET  /api/history/:fingerprint/compare     -- Before/After delta comparison
 * POST /api/history/events                   -- Create a timeline event
 * DELETE /api/history/events/:id             -- Delete a timeline event
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { fingerprintQuery } from '../../lib/utils/query-fingerprint.js';
import { computeComparisonDelta } from '../../lib/utils/comparison-delta.js';
import * as eventsStore from '../store/events-store.js';
import { asyncHandler } from '../middleware/async-handler.js';
import type { QueryFingerprintSummary, QueryHistoryEntry, QueryEventType } from '../../lib/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR: string = path.join(__dirname, '..', '..', 'performance_results');

const router: Router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────

interface ParsedSingleResult {
  testId: string;
  testName: string;
  queryFingerprint?: string;
  queryNormalized?: string;
  result: {
    query?: string;
    timestamp?: string;
    statistics?: Record<string, unknown>;
    explainAnalyze?: { data?: Record<string, unknown> };
    [key: string]: unknown;
  };
}

/**
 * Scan performance_results/ and return parsed single-test results.
 * Parallel and comparison results are excluded (they use different shapes).
 */
async function loadSingleResults(): Promise<ParsedSingleResult[]> {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const files = await fs.readdir(RESULTS_DIR);
  const jsonFiles = files.filter(f => f.startsWith('test_') && f.endsWith('.json'));

  const results: ParsedSingleResult[] = [];

  await Promise.all(jsonFiles.map(async (file) => {
    try {
      const raw = await fs.readFile(path.join(RESULTS_DIR, file), 'utf8');
      const data = JSON.parse(raw) as ParsedSingleResult;
      if (data.result) results.push(data);
    } catch {
      // Skip malformed files
    }
  }));

  return results;
}

/**
 * Resolve the fingerprint for a result.
 * Uses the stored queryFingerprint if available, otherwise computes lazily.
 */
function resolveFingerprint(r: ParsedSingleResult): string | null {
  if (r.queryFingerprint) return r.queryFingerprint;
  const sql = r.result?.query;
  if (!sql) return null;
  return fingerprintQuery(sql).hash;
}

// ─── GET /fingerprints ──────────────────────────────────────────────────

router.get('/fingerprints', asyncHandler(async (_req: Request, res: Response) => {
  const results = await loadSingleResults();

  // Group by fingerprint
  const map = new Map<string, {
    queryText: string;
    latestTestName: string;
    latestRunAt: string;
    runCount: number;
  }>();

  for (const r of results) {
    const fp = resolveFingerprint(r);
    if (!fp) continue;

    const timestamp = r.result.timestamp || '';
    const existing = map.get(fp);

    if (!existing) {
      map.set(fp, {
        queryText: r.result.query || '',
        latestTestName: r.testName || '',
        latestRunAt: timestamp,
        runCount: 1,
      });
    } else {
      existing.runCount++;
      if (timestamp > existing.latestRunAt) {
        existing.latestRunAt = timestamp;
        existing.latestTestName = r.testName || '';
        existing.queryText = r.result.query || existing.queryText;
      }
    }
  }

  const summaries: QueryFingerprintSummary[] = Array.from(map.entries())
    .map(([queryFingerprint, v]) => ({
      queryFingerprint,
      queryText: v.queryText,
      latestTestName: v.latestTestName,
      runCount: v.runCount,
      latestRunAt: v.latestRunAt,
    }))
    .sort((a, b) => b.latestRunAt.localeCompare(a.latestRunAt));

  res.json({ success: true, data: summaries });
}));

// ─── GET /:fingerprint ──────────────────────────────────────────────────

router.get('/:fingerprint', asyncHandler(async (req: Request, res: Response) => {
  const fp = req.params.fingerprint as string;
  if (!fp || !/^[0-9a-f]{16}(?:[0-9a-f]{16})?$/.test(fp)) {
    res.status(400).json({ success: false, error: '不正なフィンガープリントです' });
    return;
  }

  const results = await loadSingleResults();
  const entries: QueryHistoryEntry[] = [];
  let queryText = '';

  for (const r of results) {
    const rFp = resolveFingerprint(r);
    if (rFp !== fp) continue;

    if (!queryText && r.result.query) queryText = r.result.query;

    // Extract EXPLAIN access type if available
    let explainAccessType: string | undefined;
    try {
      const explainData = r.result.explainAnalyze?.data as Record<string, unknown> | undefined;
      if (explainData?.query_block) {
        const qb = explainData.query_block as Record<string, unknown>;
        const table = qb.table as Record<string, unknown> | undefined;
        if (table?.access_type) explainAccessType = String(table.access_type);
      }
    } catch { /* ignore */ }

    if (r.result.statistics) {
      entries.push({
        testId: r.testId,
        testName: r.testName,
        timestamp: r.result.timestamp || '',
        statistics: r.result.statistics as unknown as QueryHistoryEntry['statistics'],
        explainAccessType,
      });
    }
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const events = await eventsStore.listByFingerprint(fp);

  res.json({
    success: true,
    data: { queryFingerprint: fp, queryText, entries, events },
  });
}));

// ─── GET /:fingerprint/compare ──────────────────────────────────────────

router.get('/:fingerprint/compare', asyncHandler(async (req: Request, res: Response) => {
  const { before, after } = req.query as { before?: string; after?: string };
  if (!before || !after) {
    res.status(400).json({ success: false, error: 'before と after のtestIdを指定してください' });
    return;
  }

  // Read both result files
  async function readStats(testId: string) {
    const filePath = path.join(RESULTS_DIR, `${testId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as ParsedSingleResult;
    return data.result?.statistics;
  }

  try {
    const [statsBefore, statsAfter] = await Promise.all([
      readStats(before),
      readStats(after),
    ]);

    if (!statsBefore || !statsAfter) {
      res.status(400).json({ success: false, error: '統計データが見つかりません' });
      return;
    }

    const delta = computeComparisonDelta(
      statsBefore as Parameters<typeof computeComparisonDelta>[0],
      statsAfter as Parameters<typeof computeComparisonDelta>[0],
    );

    res.json({
      success: true,
      data: { before: statsBefore, after: statsAfter, delta },
    });
  } catch {
    res.status(404).json({ success: false, error: '結果ファイルが見つかりません' });
  }
}));

// ─── POST /events ───────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set<QueryEventType>([
  'index_added', 'index_removed', 'schema_change', 'config_change', 'custom',
]);

router.post('/events', asyncHandler(async (req: Request, res: Response) => {
  const { queryFingerprint, label, type, timestamp } = req.body as {
    queryFingerprint?: string;
    label?: string;
    type?: string;
    timestamp?: string;
  };

  if (!queryFingerprint || !label || !type) {
    res.status(400).json({ success: false, error: 'queryFingerprint, label, type は必須です' });
    return;
  }
  if (!VALID_EVENT_TYPES.has(type as QueryEventType)) {
    res.status(400).json({ success: false, error: `不正なイベントタイプです: ${type}` });
    return;
  }

  const event = await eventsStore.create({
    queryFingerprint,
    label,
    type: type as QueryEventType,
    timestamp,
  });

  res.status(201).json({ success: true, data: event });
}));

// ─── DELETE /events/:id ─────────────────────────────────────────────────

router.delete('/events/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ success: false, error: 'イベントIDが指定されていません' });
    return;
  }

  const deleted = await eventsStore.remove(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'イベントが見つかりません' });
    return;
  }

  res.json({ success: true });
}));

export default router;
