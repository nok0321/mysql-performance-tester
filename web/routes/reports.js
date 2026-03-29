/**
 * reports.js - レポートルート
 *
 * GET  /api/reports        — performance_results/ 配下の一覧
 * GET  /api/reports/:id    — 個別レポートの JSON
 * GET  /api/reports/:id/export?format=json|csv|html|markdown
 */

import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { ReportGenerator } from '../../lib/reports/report-generator.js';
import {
  JsonExporter,
  MarkdownExporter,
  HtmlExporter,
  CsvExporter
} from '../../lib/reports/exporters/index.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', '..', 'performance_results');

const router = Router();

/** レポート一覧（performance_results/ 下の JSON） */
router.get('/', asyncHandler(async (req, res) => {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const entries = await fs.readdir(RESULTS_DIR, { withFileTypes: true });

  const reports = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // タイムスタンプディレクトリ（main.js の実行結果）
      const dir = path.join(RESULTS_DIR, entry.name);
      const files = await fs.readdir(dir).catch(() => []);
      const resultsFile = files.find(f => f === 'results.json');
      if (resultsFile) {
        const stat = await fs.stat(path.join(dir, resultsFile));
        reports.push({
          id: entry.name,
          type: 'batch',
          directory: entry.name,
          createdAt: stat.mtime.toISOString()
        });
      }
    } else if (entry.name.endsWith('.json') && (
      entry.name.startsWith('test_') || entry.name.startsWith('parallel_')
    )) {
      // Web UI が生成した個別テスト結果
      const stat = await fs.stat(path.join(RESULTS_DIR, entry.name));
      const raw = await fs.readFile(path.join(RESULTS_DIR, entry.name), 'utf8');
      const data = JSON.parse(raw);
      reports.push({
        id: entry.name.replace('.json', ''),
        type: entry.name.startsWith('parallel_') ? 'parallel' : 'single',
        testName: data.testName || data.testId,
        createdAt: stat.mtime.toISOString(),
        size: stat.size
      });
    }
  }

  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: reports });
}));

/** 個別レポート詳細 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'レポートID');

  // Web UI の個別テスト結果
  const singleFile = path.join(RESULTS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(singleFile, 'utf8');
    return res.json({ success: true, data: JSON.parse(raw) });
  } catch { /* not found - try directory */ }

  // main.js のバッチ結果ディレクトリ
  try {
    const batchFile = path.join(RESULTS_DIR, id, 'results.json');
    const raw = await fs.readFile(batchFile, 'utf8');
    return res.json({ success: true, data: JSON.parse(raw) });
  } catch {
    return res.status(404).json({ success: false, error: 'レポートが見つかりません' });
  }
}));

/** エクスポート */
router.get('/:id/export', asyncHandler(async (req, res) => {
  const { format = 'json' } = req.query;
  const id = validateId(req.params.id, 'レポートID');

  // ─── 結果 JSON を読み込む ────────────────────────────────────────────────
  let rawData;
  const singleFile = path.join(RESULTS_DIR, `${id}.json`);
  try {
    rawData = JSON.parse(await fs.readFile(singleFile, 'utf8'));
  } catch {
    rawData = JSON.parse(await fs.readFile(path.join(RESULTS_DIR, id, 'results.json'), 'utf8'));
  }

  // ─── testResults を必ず配列に正規化 ─────────────────────────────────────
  let testResultsArray;

  if (rawData.result) {
    testResultsArray = [rawData.result];
  } else if (rawData.results && !Array.isArray(rawData.results)) {
    testResultsArray = Object.entries(rawData.results).map(([strategy, data]) => ({
      testName: rawData.testName ? `${rawData.testName}: ${strategy}` : `並列テスト: ${strategy}`,
      strategy,
      parallelResults: data
    }));
  } else if (Array.isArray(rawData.results)) {
    testResultsArray = rawData.results;
  } else {
    testResultsArray = [];
  }

  const config = rawData.config || {};

  // ─── フォーマット別エクスポーター定義 ────────────────────────────────────
  const exporterMap = {
    json: { exporter: new JsonExporter(), mime: 'application/json', ext: 'json', multi: false },
    markdown: { exporter: new MarkdownExporter(), mime: 'text/markdown', ext: 'md', multi: false },
    html: { exporter: new HtmlExporter(), mime: 'text/html', ext: 'html', multi: false },
    csv: { exporter: new CsvExporter(), mime: 'text/csv', ext: 'csv', multi: true },
  };

  const target = exporterMap[format];
  if (!target) {
    return res.status(400).json({ success: false, error: '未対応のフォーマットです' });
  }

  // ─── ReportGenerator で分析 ──────────────────────────────────────────────
  const generator = new ReportGenerator(testResultsArray, config);
  await generator.analyze();

  const tmpToken = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpDir = path.join(RESULTS_DIR, '_tmp_export', tmpToken);
  await fs.mkdir(tmpDir, { recursive: true });

  // ─── エクスポート実行 ────────────────────────────────────────────────────
  let exported;
  try {
    exported = await generator.exportReports(tmpDir, [target.exporter]);
  } catch (exportErr) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw exportErr;
  }

  const exportedValue = Object.values(exported)[0];

  if (!exportedValue) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return res.status(500).json({ success: false, error: 'エクスポートに失敗しました' });
  }

  let contentPath;
  if (target.multi && typeof exportedValue === 'object') {
    contentPath = exportedValue.summary || Object.values(exportedValue)[0];
  } else {
    contentPath = exportedValue;
  }

  if (!contentPath || typeof contentPath !== 'string') {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return res.status(500).json({ success: false, error: 'エクスポートパスが解決できませんでした' });
  }

  const content = await fs.readFile(contentPath);
  res.setHeader('Content-Type', target.mime);
  res.setHeader('Content-Disposition', `attachment; filename="report_${id}.${target.ext}"`);
  res.send(content);

  // 一時ディレクトリごと削除（非同期でOK）
  fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}));

export default router;
