/**
 * tests.js - テスト実行ルート
 *
 * POST /api/tests/single  — 単一テスト実行（WebSocket で進捗 Push）
 * POST /api/tests/parallel — 並列テスト実行（WebSocket で進捗 Push）
 * GET  /api/tests/results  — 過去実行結果一覧
 * GET  /api/tests/results/:id — 個別結果詳細
 *
 * WebSocket メッセージ形式:
 *   { type: 'progress', testId, data: { phase, current, total, duration } }
 *   { type: 'complete', testId, data: <TestResult> }
 *   { type: 'error',    testId, data: { message } }
 */

import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import * as connectionStore from '../store/connections-store.js';
import * as sqlStore from '../store/sql-store.js';
import { MySQLPerformanceTester } from '../../lib/testers/single-tester.js';
import { ParallelPerformanceTester } from '../../lib/testers/parallel-tester.js';
import { createDbConfig } from '../../lib/config/database-configuration.js';
import { createTestConfig } from '../../lib/config/test-configuration.js';
import { validateQuery } from '../../lib/utils/validator.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';

// ─── 同時テスト実行数の上限セマフォ ──────────────────────────────────────
// N × parallelThreads 分の MySQL 接続が同時に開かれることを防ぐ。
// 超過時は 429 を返してクライアントに再試行を促す。
const MAX_CONCURRENT_TESTS = Number(process.env.MAX_CONCURRENT_TESTS) || 3;
let _activeTests = 0;

function acquireSemaphore() {
  if (_activeTests >= MAX_CONCURRENT_TESTS) return false;
  _activeTests++;
  return true;
}

function releaseSemaphore() {
  _activeTests = Math.max(0, _activeTests - 1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** プロジェクトルート（2階層上） */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
/** 性能試験結果の保存先（プロジェクトルートの performance_results/ ） */
const RESULTS_DIR = path.join(PROJECT_ROOT, 'performance_results');
/** SQLライブラリ並列テスト用一時ディレクトリ */
const TMP_PARALLEL_DIR = path.join(PROJECT_ROOT, '.tmp_parallel');

/**
 * parallelDirectory のパス検証
 * - 絶対パス NG
 * - ../ によるプロジェクトルート外へのトラバーサル NG
 * @param {string} dir - ユーザー入力ディレクトリ
 * @returns {string} 検証済み絶対パス
 * @throws {Error} 不正なパスの場合
 */
function validateParallelDir(dir) {
  if (!dir || typeof dir !== 'string') throw new Error('ディレクトリが指定されていません');
  // 絶対パスを拒否
  if (path.isAbsolute(dir)) throw new Error('絶対パスは指定できません');
  // path.resolve でプロジェクトルートからの絶対パスに変換
  const resolved = path.resolve(PROJECT_ROOT, dir);
  // プロジェクトルート外を拒否（パストラバーサル対策）
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    throw new Error('プロジェクトルート外のディレクトリは指定できません');
  }
  return resolved;
}

const router = Router();

// ─── WebSocket ブロードキャストのヘルパー ──────────────────────────────────
/**
 * 特定 testId を購読しているクライアントにのみメッセージを送信する。
 *
 * クライアントは ws.subscribedTestIds（Set<string>）で購読 testId を管理する。
 * testId が未購読のクライアントには送信しない（他ユーザーへの情報漏洩防止）。
 * subscribedTestIds が未設定のクライアント（接続直後など）には送信しない。
 *
 * @param {import('ws').WebSocketServer} wss
 * @param {string} testId
 * @param {string} type - 'progress' | 'complete' | 'error'
 * @param {Object} data
 */
function broadcast(wss, testId, type, data) {
  if (!wss) return;

  // complete / error はターミナルイベント: 60 秒間キャッシュして
  // subscribe 遅延時のリプレイに備える（server.js が wss.terminalEventCache にセット）
  if ((type === 'complete' || type === 'error') && wss.terminalEventCache) {
    const cache = wss.terminalEventCache;
    const prev = cache.get(testId);
    if (prev?.timer) clearTimeout(prev.timer);
    const timer = setTimeout(() => cache.delete(testId), 60_000);
    timer.unref?.();
    cache.set(testId, { type, data, timer });
  }

  const msg = JSON.stringify({ type, testId, data });
  wss.clients.forEach(client => {
    if (client.readyState !== 1 /* OPEN */) return;
    if (!client.subscribedTestIds?.has(testId)) return;
    client.send(msg);
  });
}

// ─── 設定ビルダー ──────────────────────────────────────────────────────────
/**
 * リクエストボディから dbConfig と testConfig を別々に生成して返す
 * @returns {{ dbConfig: Object, testConfig: Object }}
 */
async function buildConfigs(body) {
  const {
    connectionId,
    testIterations: rawIterations = 20,
    enableWarmup = true,
    warmupPercentage = 20,
    removeOutliers = false,
    outlierMethod = 'iqr',
    enableExplainAnalyze = true,
    enableOptimizerTrace = false,
    enableBufferPoolMonitoring = true,
    enablePerformanceSchema = false,
    parallelThreads: rawThreads = 5,
    sqlDirectory = './sql',
    parallelDirectory = './parallel',
  } = body;

  // 上限・下限を強制
  const testIterations  = Math.min(Math.max(1, Number(rawIterations) || 1), 10000);
  const parallelThreads = Math.min(Math.max(1, Number(rawThreads)    || 1), 200);

  // connectionId のバリデーション（未検証のまま Store に渡さない）
  const safeConnectionId = validateId(connectionId, '接続ID');
  const connData = await connectionStore.getById(safeConnectionId);
  if (!connData) throw new Error('指定された接続が見つかりません');

  const dbConfig = createDbConfig({
    host:     connData.host,
    port:     connData.port,
    user:     connData.user,
    password: connData.password,
    database: connData.database,
    parallelThreads,
  });

  const testConfig = createTestConfig({
    testIterations,
    parallelThreads,
    enableWarmup,
    warmupPercentage,
    removeOutliers,
    outlierMethod,
    enableExplainAnalyze,
    enableOptimizerTrace,
    enableBufferPoolMonitoring,
    enablePerformanceSchema,
    sqlDirectory,
    parallelDirectory,
    generateReport:    true,
    enableDebugOutput: false,  // Web UI では debug ファイル出力を抑制
  });

  return { dbConfig, testConfig };
}

// ─── 単一テスト ───────────────────────────────────────────────────────────
router.post('/single', async (req, res) => {
  // 同時実行数チェック
  if (!acquireSemaphore()) {
    return res.status(429).json({
      success: false,
      error: `同時実行可能なテスト数の上限（${MAX_CONCURRENT_TESTS}）に達しています。しばらく待ってから再試行してください。`
    });
  }

  // ─ バリデーションとビルドを 202 返却前に実施（エラーを同期的に返す） ─────
  const { sqlText, testName = 'Web UI Test' } = req.body;

  if (!sqlText?.trim()) {
    releaseSemaphore();
    return res.status(400).json({ success: false, error: 'SQL が指定されていません' });
  }

  try {
    validateQuery(sqlText.trim());
  } catch (validationErr) {
    releaseSemaphore();
    return res.status(400).json({ success: false, error: `SQLバリデーションエラー: ${validationErr.message}` });
  }

  let dbConfig, testConfig;
  try {
    ({ dbConfig, testConfig } = await buildConfigs(req.body));
  } catch (configErr) {
    releaseSemaphore();
    if (configErr.status === 400) return res.status(400).json({ success: false, error: configErr.message });
    if (configErr.message === '指定された接続が見つかりません') return res.status(404).json({ success: false, error: configErr.message });
    return res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }

  // testId は crypto.randomUUID() で衝突ゼロを保証（M3対応）
  const testId = `test_${randomUUID()}`;
  const wss = req.app.get('wss');

  res.status(202).json({ success: true, data: { testId } });

  // 非同期で実行（レスポンス返却後に始める）
  setImmediate(async () => {
    let tester = null;
    try {
      tester = new MySQLPerformanceTester(dbConfig, testConfig);
      tester.on('progress', (data) => broadcast(wss, testId, 'progress', data));
      await tester.initialize();

      const result = await tester.executeTestWithWarmup(testName, sqlText.trim());

      // 結果を保存
      await fs.mkdir(RESULTS_DIR, { recursive: true });
      const resultPath = path.join(RESULTS_DIR, `${testId}.json`);
      await fs.writeFile(resultPath, JSON.stringify({ testId, testName, result }, null, 2));

      broadcast(wss, testId, 'complete', {
        testId,
        testName,
        result: serializeResult(result)
      });

    } catch (err) {
      console.error(`[test:${testId}] Error:`, err.message);
      broadcast(wss, testId, 'error', { message: err.message });
    } finally {
      if (tester) await tester.cleanup().catch(() => { });
      releaseSemaphore();
    }
  });
});

// ─── 並列テスト ───────────────────────────────────────────────────────────
router.post('/parallel', async (req, res) => {
  // 同時実行数チェック
  if (!acquireSemaphore()) {
    return res.status(429).json({
      success: false,
      error: `同時実行可能なテスト数の上限（${MAX_CONCURRENT_TESTS}）に達しています。しばらく待ってから再試行してください。`
    });
  }

  // ─ バリデーションとビルドを 202 返却前に実施（エラーを同期的に返す） ─────
  const { testName = '並列テスト', parallelDirectory = './parallel', sqlIds } = req.body;

  // ディレクトリモード: パス検証を事前実施
  let preValidatedDir = null;
  if (!sqlIds || !Array.isArray(sqlIds) || sqlIds.length === 0) {
    try {
      preValidatedDir = validateParallelDir(parallelDirectory);
    } catch (dirErr) {
      releaseSemaphore();
      return res.status(400).json({ success: false, error: dirErr.message });
    }
  } else if (sqlIds.length > 50) {
    releaseSemaphore();
    return res.status(400).json({ success: false, error: '選択できるSQLは50件以内です' });
  }

  let dbConfig, testConfig;
  try {
    ({ dbConfig, testConfig } = await buildConfigs(req.body));
  } catch (configErr) {
    releaseSemaphore();
    if (configErr.status === 400) return res.status(400).json({ success: false, error: configErr.message });
    if (configErr.message === '指定された接続が見つかりません') return res.status(404).json({ success: false, error: configErr.message });
    return res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
  }

  // testId は crypto.randomUUID() で衝突ゼロを保証（M3対応）
  const testId = `parallel_${randomUUID()}`;
  const wss = req.app.get('wss');

  res.status(202).json({ success: true, data: { testId } });

  setImmediate(async () => {
    let tester = null;
    let tmpDirCreated = false;
    let usedDir = preValidatedDir;
    try {
      // ─ SQLライブラリから選択された場合は一時ディレクトリに書き出す ─────────
      if (sqlIds && Array.isArray(sqlIds) && sqlIds.length > 0) {
        // testId を含む一意なサブディレクトリを使用（競合防止）
        const tmpTestDir = path.join(TMP_PARALLEL_DIR, testId);
        await fs.mkdir(tmpTestDir, { recursive: true });
        tmpDirCreated = true;

        // SQLスニペットを並列取得してからファイルに書き出す
        const snippets = await Promise.all(sqlIds.map(id => sqlStore.getById(id)));
        const validSnippets = snippets.filter(s => s && s.sql);
        if (validSnippets.length === 0) throw new Error('有効なSQLが見つかりませんでした');

        await Promise.all(validSnippets.map((snippet, idx) => {
          const safeName = snippet.name
            .replace(/[^a-zA-Z0-9぀-鿿\-_]/g, '_')
            .substring(0, 60);
          return fs.writeFile(
            path.join(tmpTestDir, `${String(idx).padStart(2, '0')}_${safeName}.sql`),
            snippet.sql,
            'utf8'
          );
        }));
        usedDir = tmpTestDir;
      }

      tester = new ParallelPerformanceTester(dbConfig, testConfig);
      tester.on('progress', (data) => broadcast(wss, testId, 'progress', data));
      await tester.initialize();

      const results = await tester.executeParallelTestsFromFiles(usedDir);

      if (!results) {
        throw new Error(`並列実行用 SQL ファイルが見つかりませんでした。ディレクトリ「${usedDir}」に .sql ファイルを配置してください。`);
      }

      await fs.mkdir(RESULTS_DIR, { recursive: true });
      const resultPath = path.join(RESULTS_DIR, `${testId}.json`);
      await fs.writeFile(resultPath, JSON.stringify({ testId, testName, results }, null, 2));

      broadcast(wss, testId, 'complete', { testId, testName, results });

    } catch (err) {
      console.error(`[test:${testId}] Error:`, err.message);
      broadcast(wss, testId, 'error', { message: err.message });
    } finally {
      if (tester) await tester.cleanup().catch(() => { });
      // 一時ディレクトリのクリーンアップ（SQLライブラリモード時）（M4対応: fs.rmdir → fs.rm）
      if (tmpDirCreated && usedDir) {
        await fs.rm(usedDir, { recursive: true, force: true }).catch(() => { });
      }
      releaseSemaphore();
    }
  });
});

// ─── 結果一覧 ─────────────────────────────────────────────────────────────
router.get('/results', asyncHandler(async (req, res) => {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const files = await fs.readdir(RESULTS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const results = await Promise.all(
    jsonFiles.map(async file => {
      const stat = await fs.stat(path.join(RESULTS_DIR, file));
      return {
        id: file.replace('.json', ''),
        fileName: file,
        createdAt: stat.mtime.toISOString(),
        size: stat.size
      };
    })
  );

  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, data: results });
}));

// ─── 結果詳細 ─────────────────────────────────────────────────────────────
router.get('/results/:id', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, '結果ID');
  const filePath = path.join(RESULTS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    res.json({ success: true, data: JSON.parse(raw) });
  } catch {
    res.status(404).json({ success: false, error: '結果が見つかりません' });
  }
}));

// ─── シリアライザー（循環参照等を除去） ──────────────────────────────────
function serializeResult(result) {
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { error: 'シリアライズできませんでした' };
  }
}

export default router;
