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

import { computeComparisonDelta } from '../../lib/utils/comparison-delta.js';
import * as eventsStore from '../store/events-store.js';
import * as resultsStore from '../store/results-store.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parsePagination, paginate } from '../middleware/pagination.js';
import type { QueryFingerprintSummary, QueryHistoryEntry, QueryEventType } from '../../lib/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR: string = path.join(__dirname, '..', '..', 'performance_results');

const router: Router = Router();

// ─── GET /fingerprints ──────────────────────────────────────────────────

router.get('/fingerprints', asyncHandler(async (req: Request, res: Response) => {
  const { limit, offset } = parsePagination(req);
  const page = Math.floor(offset / limit) + 1;

  const { data, total } = resultsStore.getFingerprints({ page, limit });

  const summaries: QueryFingerprintSummary[] = data.map(fp => ({
    queryFingerprint: fp.queryFingerprint,
    queryText: fp.queryText,
    latestTestName: fp.latestTestName,
    runCount: fp.runCount,
    latestRunAt: fp.latestRunAt,
  }));

  res.json({
    success: true,
    data: summaries,
    pagination: { total, limit, offset },
  });
}));

// ─── GET /:fingerprint ──────────────────────────────────────────────────

router.get('/:fingerprint', asyncHandler(async (req: Request, res: Response) => {
  const fp = req.params.fingerprint as string;
  if (!fp || !/^[0-9a-f]{16}(?:[0-9a-f]{16})?$/.test(fp)) {
    res.status(400).json({ success: false, error: '不正なフィンガープリントです' });
    return;
  }

  const records = resultsStore.getByFingerprint(fp);
  let queryText = '';

  const entries: QueryHistoryEntry[] = [];
  for (const r of records) {
    if (!queryText && r.queryText) queryText = r.queryText;

    if (r.statistics) {
      entries.push({
        testId: r.id,
        testName: r.testName,
        timestamp: r.createdAt,
        statistics: r.statistics,
        explainAccessType: r.explainAccessType || undefined,
      });
    }
  }

  const events = await eventsStore.listByFingerprint(fp);

  const { limit, offset } = parsePagination(req);
  const paginatedEntries = entries.slice(offset, offset + limit);

  res.json({
    success: true,
    data: { queryFingerprint: fp, queryText, entries: paginatedEntries, events },
    pagination: { total: entries.length, limit, offset },
  });
}));

// ─── GET /:fingerprint/compare ──────────────────────────────────────────

router.get('/:fingerprint/compare', asyncHandler(async (req: Request, res: Response) => {
  const { before, after } = req.query as { before?: string; after?: string };
  if (!before || !after) {
    res.status(400).json({ success: false, error: 'before と after のtestIdを指定してください' });
    return;
  }

  // Try store first, fall back to disk for statistics
  const recordBefore = resultsStore.getById(before);
  const recordAfter = resultsStore.getById(after);

  let statsBefore = recordBefore?.statistics || null;
  let statsAfter = recordAfter?.statistics || null;

  // Fall back to reading from disk if statistics not in store
  if (!statsBefore || !statsAfter) {
    async function readStats(testId: string) {
      const filePath = path.join(RESULTS_DIR, `${testId}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw) as { result?: { statistics?: unknown } };
      return data.result?.statistics;
    }

    try {
      if (!statsBefore) statsBefore = (await readStats(before)) as typeof statsBefore;
      if (!statsAfter) statsAfter = (await readStats(after)) as typeof statsAfter;
    } catch {
      res.status(404).json({ success: false, error: '結果ファイルが見つかりません' });
      return;
    }
  }

  if (!statsBefore || !statsAfter) {
    res.status(400).json({ success: false, error: '統計データが見つかりません' });
    return;
  }

  const delta = computeComparisonDelta(statsBefore, statsAfter);

  res.json({
    success: true,
    data: { before: statsBefore, after: statsAfter, delta },
  });
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
