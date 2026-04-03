/**
 * reports.ts - Report routes
 *
 * GET  /api/reports        -- List files under performance_results/
 * GET  /api/reports/:id    -- Individual report JSON
 * GET  /api/reports/:id/export?format=json|csv|html|markdown
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { ReportGenerator } from '../../lib/reports/report-generator.js';
import { BaseExporter } from '../../lib/reports/exporters/base-exporter.js';
import {
  JsonExporter,
  MarkdownExporter,
  HtmlExporter,
  CsvExporter
} from '../../lib/reports/exporters/index.js';
import * as resultsStore from '../store/results-store.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parsePagination } from '../middleware/pagination.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR: string = path.join(__dirname, '..', '..', 'performance_results');

const router: Router = Router();

/** Report list item */
interface ReportListItem {
  id: string;
  type: string;
  directory?: string;
  testName?: string;
  createdAt: string;
  size?: number;
}

/** Exporter configuration */
interface ExporterConfig {
  exporter: BaseExporter;
  mime: string;
  ext: string;
  multi: boolean;
}

/** Report list from SQLite store (no disk scan) */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { limit, offset } = parsePagination(req);
  const typeFilter = req.query.type as string | undefined;
  const page = Math.floor(offset / limit) + 1;

  const { data, total } = resultsStore.getAll({ type: typeFilter, page, limit });

  const reports: ReportListItem[] = data.map(r => ({
    id: r.id,
    type: r.type,
    directory: r.type === 'batch' ? r.id : undefined,
    testName: r.testName || undefined,
    createdAt: r.createdAt,
    size: r.fileSize || undefined,
  }));

  res.json({
    success: true,
    data: reports,
    pagination: { total, limit, offset },
  });
}));

/** Individual report detail */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, 'レポートID');

  // Web UI individual test result
  const singleFile = path.join(RESULTS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(singleFile, 'utf8');
    res.json({ success: true, data: JSON.parse(raw) });
    return;
  } catch { /* not found - try directory */ }

  // main.js batch result directory
  try {
    const batchFile = path.join(RESULTS_DIR, id, 'results.json');
    const raw = await fs.readFile(batchFile, 'utf8');
    res.json({ success: true, data: JSON.parse(raw) });
    return;
  } catch {
    res.status(404).json({ success: false, error: 'レポートが見つかりません' });
  }
}));

/** Export */
router.get('/:id/export', asyncHandler(async (req: Request, res: Response) => {
  const { format = 'json' } = req.query as { format?: string };
  const id = validateId(req.params.id as string, 'レポートID');

  // ─── Read the result JSON ──────────────────────────────────────────────
  let rawData: Record<string, unknown>;
  const singleFile = path.join(RESULTS_DIR, `${id}.json`);
  try {
    rawData = JSON.parse(await fs.readFile(singleFile, 'utf8')) as Record<string, unknown>;
  } catch {
    rawData = JSON.parse(await fs.readFile(path.join(RESULTS_DIR, id, 'results.json'), 'utf8')) as Record<string, unknown>;
  }

  // ─── Normalize testResults to an array ─────────────────────────────────
  let testResultsArray: unknown[];

  if (rawData.result) {
    testResultsArray = [rawData.result];
  } else if (rawData.results && !Array.isArray(rawData.results)) {
    testResultsArray = Object.entries(rawData.results as Record<string, unknown>).map(([strategy, data]) => ({
      testName: rawData.testName ? `${rawData.testName}: ${strategy}` : `並列テスト: ${strategy}`,
      strategy,
      parallelResults: data
    }));
  } else if (Array.isArray(rawData.results)) {
    testResultsArray = rawData.results;
  } else {
    testResultsArray = [];
  }

  const config = (rawData.config || {}) as Record<string, unknown>;

  // ─── Format-specific exporter definitions ──────────────────────────────
  const exporterMap: Record<string, ExporterConfig> = {
    json: { exporter: new JsonExporter(), mime: 'application/json', ext: 'json', multi: false },
    markdown: { exporter: new MarkdownExporter(), mime: 'text/markdown', ext: 'md', multi: false },
    html: { exporter: new HtmlExporter(), mime: 'text/html', ext: 'html', multi: false },
    csv: { exporter: new CsvExporter() as unknown as BaseExporter, mime: 'text/csv', ext: 'csv', multi: true },
  };

  const target = exporterMap[format];
  if (!target) {
    res.status(400).json({ success: false, error: '未対応のフォーマットです' });
    return;
  }

  // ─── Analyze with ReportGenerator ──────────────────────────────────────
  const generator = new ReportGenerator(testResultsArray, config);
  await generator.analyze();

  const tmpToken = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpDir = path.join(RESULTS_DIR, '_tmp_export', tmpToken);
  await fs.mkdir(tmpDir, { recursive: true });

  // ─── Execute export ────────────────────────────────────────────────────
  let exported: Record<string, unknown>;
  try {
    exported = await generator.exportReports(tmpDir, [target.exporter]) as Record<string, unknown>;
  } catch (exportErr) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw exportErr;
  }

  const exportedValue = Object.values(exported)[0] as string | Record<string, string> | undefined;

  if (!exportedValue) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ success: false, error: 'エクスポートに失敗しました' });
    return;
  }

  let contentPath: string | undefined;
  if (target.multi && typeof exportedValue === 'object') {
    contentPath = (exportedValue as Record<string, string>).summary || Object.values(exportedValue)[0];
  } else {
    contentPath = exportedValue as string;
  }

  if (!contentPath || typeof contentPath !== 'string') {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ success: false, error: 'エクスポートパスが解決できませんでした' });
    return;
  }

  const content = await fs.readFile(contentPath);
  res.setHeader('Content-Type', target.mime);
  res.setHeader('Content-Disposition', `attachment; filename="report_${id}.${target.ext}"`);
  res.send(content);

  // Delete temporary directory asynchronously
  fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}));

export default router;
