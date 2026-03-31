/**
 * tests.ts - Test execution routes
 *
 * POST /api/tests/single  -- Single test execution (WebSocket progress push)
 * POST /api/tests/parallel -- Parallel test execution (WebSocket progress push)
 * GET  /api/tests/results  -- Past execution results list
 * GET  /api/tests/results/:id -- Individual result detail
 *
 * WebSocket message format:
 *   { type: 'progress', testId, data: { phase, current, total, duration } }
 *   { type: 'complete', testId, data: <TestResult> }
 *   { type: 'error',    testId, data: { message } }
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { WebSocketServer, WebSocket } from 'ws';

import * as connectionStore from '../store/connections-store.js';
import * as sqlStore from '../store/sql-store.js';
import { MySQLPerformanceTester } from '../../lib/testers/single-tester.js';
import { ParallelPerformanceTester } from '../../lib/testers/parallel-tester.js';
import { createDbConfig } from '../../lib/config/database-configuration.js';
import { createTestConfig } from '../../lib/config/test-configuration.js';
import { validateQuery } from '../../lib/utils/validator.js';
import { computeComparisonDelta } from '../../lib/utils/comparison-delta.js';
import { validateId } from '../security/validate-id.js';
import { asyncHandler } from '../middleware/async-handler.js';
import type { DbConfig, TestConfig } from '../../lib/types/index.js';

// ─── Extended WebSocket types for subscription management ────────────────
interface SubscribableWebSocket extends WebSocket {
  subscribedTestIds?: Set<string>;
}

interface TerminalEvent {
  type: string;
  data: unknown;
  timer: ReturnType<typeof setTimeout>;
}

interface ExtendedWebSocketServer extends WebSocketServer {
  terminalEventCache?: Map<string, TerminalEvent>;
}

// ─── Concurrent test execution semaphore ─────────────────────────────────
// Prevents too many MySQL connections from opening simultaneously.
// Returns 429 to clients when exceeded, prompting retry.
const MAX_CONCURRENT_TESTS: number = Number(process.env.MAX_CONCURRENT_TESTS) || 3;
let _activeTests = 0;

function acquireSemaphore(): boolean {
  if (_activeTests >= MAX_CONCURRENT_TESTS) return false;
  _activeTests++;
  return true;
}

function releaseSemaphore(): void {
  _activeTests = Math.max(0, _activeTests - 1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Project root (two levels up) */
const PROJECT_ROOT: string = path.resolve(__dirname, '..', '..');
/** Performance test result storage (performance_results/ in project root) */
const RESULTS_DIR: string = path.join(PROJECT_ROOT, 'performance_results');
/** Temporary directory for SQL library parallel tests */
const TMP_PARALLEL_DIR: string = path.join(PROJECT_ROOT, '.tmp_parallel');

/** Request body for single test */
interface SingleTestBody {
  connectionId: string;
  sqlText?: string;
  testName?: string;
  testIterations?: number;
  enableWarmup?: boolean;
  warmupPercentage?: number;
  removeOutliers?: boolean;
  outlierMethod?: string;
  enableExplainAnalyze?: boolean;
  enableOptimizerTrace?: boolean;
  enableBufferPoolMonitoring?: boolean;
  enablePerformanceSchema?: boolean;
  parallelThreads?: number;
  sqlDirectory?: string;
  parallelDirectory?: string;
}

/** Request body for parallel test */
interface ParallelTestBody extends SingleTestBody {
  sqlIds?: string[];
}

/** Request body for comparison test */
interface ComparisonTestBody extends SingleTestBody {
  sqlTextA: string;
  sqlTextB: string;
  testNameA?: string;
  testNameB?: string;
  executionMode?: 'sequential' | 'parallel';
}

/** Error with an optional HTTP status code */
interface HttpError extends Error {
  status?: number;
}

/**
 * Validate the parallelDirectory path.
 * - Absolute paths are rejected
 * - Path traversal outside the project root is rejected
 */
function validateParallelDir(dir: string): string {
  if (!dir || typeof dir !== 'string') throw new Error('ディレクトリが指定されていません');
  // Reject absolute paths
  if (path.isAbsolute(dir)) throw new Error('絶対パスは指定できません');
  // Resolve to an absolute path from the project root
  const resolved = path.resolve(PROJECT_ROOT, dir);
  // Reject paths outside the project root (path traversal protection)
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    throw new Error('プロジェクトルート外のディレクトリは指定できません');
  }
  return resolved;
}

const router: Router = Router();

// ─── WebSocket broadcast helper ──────────────────────────────────────────
/**
 * Send a message only to clients subscribing to the given testId.
 *
 * Clients manage subscriptions via ws.subscribedTestIds (Set<string>).
 * Clients not subscribed to the testId will not receive the message.
 * Clients without subscribedTestIds (e.g., just connected) will not receive it.
 */
function broadcast(
  wss: ExtendedWebSocketServer | undefined,
  testId: string,
  type: string,
  data: unknown
): void {
  if (!wss) return;

  // complete / error are terminal events: cache for 60 seconds
  // to allow replay when subscribe arrives after the event
  if ((type === 'complete' || type === 'error') && wss.terminalEventCache) {
    const cache = wss.terminalEventCache;
    const prev = cache.get(testId);
    if (prev?.timer) clearTimeout(prev.timer);
    const timer = setTimeout(() => cache.delete(testId), 60_000);
    timer.unref?.();
    cache.set(testId, { type, data, timer });
  }

  const msg = JSON.stringify({ type, testId, data });
  wss.clients.forEach((client: SubscribableWebSocket) => {
    if (client.readyState !== 1 /* OPEN */) return;
    if (!client.subscribedTestIds?.has(testId)) return;
    client.send(msg);
  });
}

// ─── Config builder ──────────────────────────────────────────────────────
/**
 * Build dbConfig and testConfig from the request body
 */
async function buildConfigs(body: SingleTestBody): Promise<{ dbConfig: DbConfig; testConfig: TestConfig }> {
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

  // Clamp to min/max bounds
  const testIterations  = Math.min(Math.max(1, Number(rawIterations) || 1), 10000);
  const parallelThreads = Math.min(Math.max(1, Number(rawThreads)    || 1), 200);

  // Validate connectionId before passing to the store
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
    enableDebugOutput: false,  // suppress debug file output in Web UI
  });

  return { dbConfig, testConfig };
}

// ─── Single test ─────────────────────────────────────────────────────────
router.post('/single', async (req: Request, res: Response) => {
  // Check concurrent execution limit
  if (!acquireSemaphore()) {
    res.status(429).json({
      success: false,
      error: `同時実行可能なテスト数の上限（${MAX_CONCURRENT_TESTS}）に達しています。しばらく待ってから再試行してください。`
    });
    return;
  }

  // ─ Validate and build before returning 202 (synchronous error response) ─
  const { sqlText, testName = 'Web UI Test' } = req.body as SingleTestBody;

  if (!sqlText?.trim()) {
    releaseSemaphore();
    res.status(400).json({ success: false, error: 'SQL が指定されていません' });
    return;
  }

  try {
    validateQuery(sqlText.trim());
  } catch (validationErr) {
    releaseSemaphore();
    res.status(400).json({ success: false, error: `SQLバリデーションエラー: ${(validationErr as Error).message}` });
    return;
  }

  let dbConfig: DbConfig;
  let testConfig: TestConfig;
  try {
    ({ dbConfig, testConfig } = await buildConfigs(req.body as SingleTestBody));
  } catch (configErr) {
    releaseSemaphore();
    if ((configErr as HttpError).status === 400) {
      res.status(400).json({ success: false, error: (configErr as Error).message });
      return;
    }
    if ((configErr as Error).message === '指定された接続が見つかりません') {
      res.status(404).json({ success: false, error: (configErr as Error).message });
      return;
    }
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
    return;
  }

  // testId uses crypto.randomUUID() for guaranteed uniqueness
  const testId = `test_${randomUUID()}`;
  const wss = req.app.get('wss') as ExtendedWebSocketServer | undefined;

  res.status(202).json({ success: true, data: { testId } });

  // Execute asynchronously (after response is sent)
  setImmediate(async () => {
    let tester: MySQLPerformanceTester | null = null;
    try {
      tester = new MySQLPerformanceTester(dbConfig, testConfig);
      tester.on('progress', (data: unknown) => broadcast(wss, testId, 'progress', data));
      await tester.initialize();

      const result = await tester.executeTestWithWarmup(testName, sqlText.trim());

      // Save result
      await fs.mkdir(RESULTS_DIR, { recursive: true });
      const resultPath = path.join(RESULTS_DIR, `${testId}.json`);
      await fs.writeFile(resultPath, JSON.stringify({ testId, testName, result }, null, 2));

      broadcast(wss, testId, 'complete', {
        testId,
        testName,
        result: serializeResult(result)
      });

    } catch (err) {
      console.error(`[test:${testId}] Error:`, (err as Error).message);
      broadcast(wss, testId, 'error', { message: (err as Error).message });
    } finally {
      if (tester) await tester.cleanup().catch(() => { });
      releaseSemaphore();
    }
  });
});

// ─── Parallel test ───────────────────────────────────────────────────────
router.post('/parallel', async (req: Request, res: Response) => {
  // Check concurrent execution limit
  if (!acquireSemaphore()) {
    res.status(429).json({
      success: false,
      error: `同時実行可能なテスト数の上限（${MAX_CONCURRENT_TESTS}）に達しています。しばらく待ってから再試行してください。`
    });
    return;
  }

  // ─ Validate and build before returning 202 (synchronous error response) ─
  const { testName = '並列テスト', parallelDirectory = './parallel', sqlIds } = req.body as ParallelTestBody;

  // Directory mode: validate path before proceeding
  let preValidatedDir: string | null = null;
  if (!sqlIds || !Array.isArray(sqlIds) || sqlIds.length === 0) {
    try {
      preValidatedDir = validateParallelDir(parallelDirectory);
    } catch (dirErr) {
      releaseSemaphore();
      res.status(400).json({ success: false, error: (dirErr as Error).message });
      return;
    }
  } else if (sqlIds.length > 50) {
    releaseSemaphore();
    res.status(400).json({ success: false, error: '選択できるSQLは50件以内です' });
    return;
  }

  let dbConfig: DbConfig;
  let testConfig: TestConfig;
  try {
    ({ dbConfig, testConfig } = await buildConfigs(req.body as SingleTestBody));
  } catch (configErr) {
    releaseSemaphore();
    if ((configErr as HttpError).status === 400) {
      res.status(400).json({ success: false, error: (configErr as Error).message });
      return;
    }
    if ((configErr as Error).message === '指定された接続が見つかりません') {
      res.status(404).json({ success: false, error: (configErr as Error).message });
      return;
    }
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
    return;
  }

  // testId uses crypto.randomUUID() for guaranteed uniqueness
  const testId = `parallel_${randomUUID()}`;
  const wss = req.app.get('wss') as ExtendedWebSocketServer | undefined;

  res.status(202).json({ success: true, data: { testId } });

  setImmediate(async () => {
    let tester: ParallelPerformanceTester | null = null;
    let tmpDirCreated = false;
    let usedDir: string | null = preValidatedDir;
    try {
      // ─ Write SQL snippets from library to temp directory if sqlIds are specified ─
      if (sqlIds && Array.isArray(sqlIds) && sqlIds.length > 0) {
        // Use a unique subdirectory per testId (concurrency safety)
        const tmpTestDir = path.join(TMP_PARALLEL_DIR, testId);
        await fs.mkdir(tmpTestDir, { recursive: true });
        tmpDirCreated = true;

        // Fetch SQL snippets in parallel then write to files
        const snippets = await Promise.all(sqlIds.map(id => sqlStore.getById(id)));
        const validSnippets = snippets.filter((s): s is NonNullable<typeof s> => s !== null && !!s.sql);
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
      tester.on('progress', (data: unknown) => broadcast(wss, testId, 'progress', data));
      await tester.initialize();

      const results = await tester.executeParallelTestsFromFiles(usedDir!);

      if (!results) {
        throw new Error(`並列実行用 SQL ファイルが見つかりませんでした。ディレクトリ「${usedDir}」に .sql ファイルを配置してください。`);
      }

      await fs.mkdir(RESULTS_DIR, { recursive: true });
      const resultPath = path.join(RESULTS_DIR, `${testId}.json`);
      await fs.writeFile(resultPath, JSON.stringify({ testId, testName, results }, null, 2));

      broadcast(wss, testId, 'complete', { testId, testName, results });

    } catch (err) {
      console.error(`[test:${testId}] Error:`, (err as Error).message);
      broadcast(wss, testId, 'error', { message: (err as Error).message });
    } finally {
      if (tester) await tester.cleanup().catch(() => { });
      // Clean up temporary directory (SQL library mode)
      if (tmpDirCreated && usedDir) {
        await fs.rm(usedDir, { recursive: true, force: true }).catch(() => { });
      }
      releaseSemaphore();
    }
  });
});

// ─── Comparison test ────────────────────────────────────────────────────
router.post('/comparison', async (req: Request, res: Response) => {
  if (!acquireSemaphore()) {
    res.status(429).json({
      success: false,
      error: `同時実行可能なテスト数の上限（${MAX_CONCURRENT_TESTS}）に達しています。しばらく待ってから再試行してください。`
    });
    return;
  }

  const {
    sqlTextA, sqlTextB,
    testNameA = 'Query A', testNameB = 'Query B',
    executionMode = 'sequential',
  } = req.body as ComparisonTestBody;

  // Validate both queries
  if (!sqlTextA?.trim() || !sqlTextB?.trim()) {
    releaseSemaphore();
    res.status(400).json({ success: false, error: 'Query A と Query B の両方を入力してください' });
    return;
  }

  try {
    validateQuery(sqlTextA.trim());
    validateQuery(sqlTextB.trim());
  } catch (validationErr) {
    releaseSemaphore();
    res.status(400).json({ success: false, error: `SQLバリデーションエラー: ${(validationErr as Error).message}` });
    return;
  }

  let dbConfig: DbConfig;
  let testConfig: TestConfig;
  try {
    ({ dbConfig, testConfig } = await buildConfigs(req.body as SingleTestBody));
  } catch (configErr) {
    releaseSemaphore();
    if ((configErr as HttpError).status === 400) {
      res.status(400).json({ success: false, error: (configErr as Error).message });
      return;
    }
    if ((configErr as Error).message === '指定された接続が見つかりません') {
      res.status(404).json({ success: false, error: (configErr as Error).message });
      return;
    }
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました' });
    return;
  }

  const testId = `comparison_${randomUUID()}`;
  const wss = req.app.get('wss') as ExtendedWebSocketServer | undefined;

  res.status(202).json({ success: true, data: { testId } });

  setImmediate(async () => {
    let testerA: MySQLPerformanceTester | null = null;
    let testerB: MySQLPerformanceTester | null = null;
    try {
      if (executionMode === 'parallel') {
        // Parallel: two independent tester instances running concurrently
        testerA = new MySQLPerformanceTester(dbConfig, testConfig);
        testerB = new MySQLPerformanceTester(dbConfig, testConfig);
        testerA.on('progress', (data: Record<string, unknown>) =>
          broadcast(wss, testId, 'progress', { ...data, phase: `queryA:${data.phase || ''}` }));
        testerB.on('progress', (data: Record<string, unknown>) =>
          broadcast(wss, testId, 'progress', { ...data, phase: `queryB:${data.phase || ''}` }));

        await Promise.all([testerA.initialize(), testerB.initialize()]);
        const [resultA, resultB] = await Promise.all([
          testerA.executeTestWithWarmup(testNameA, sqlTextA.trim()),
          testerB.executeTestWithWarmup(testNameB, sqlTextB.trim()),
        ]);

        const delta = (resultA.statistics && resultB.statistics)
          ? computeComparisonDelta(resultA.statistics, resultB.statistics)
          : null;

        await fs.mkdir(RESULTS_DIR, { recursive: true });
        const resultPath = path.join(RESULTS_DIR, `${testId}.json`);
        await fs.writeFile(resultPath, JSON.stringify({
          type: 'comparison', testId, executionMode,
          testNameA, testNameB,
          resultA, resultB, delta,
        }, null, 2));

        broadcast(wss, testId, 'complete', {
          testId, executionMode, testNameA, testNameB,
          resultA: serializeResult(resultA),
          resultB: serializeResult(resultB),
          delta,
        });
      } else {
        // Sequential: single tester instance, A then B
        testerA = new MySQLPerformanceTester(dbConfig, testConfig);
        testerA.on('progress', (data: Record<string, unknown>) =>
          broadcast(wss, testId, 'progress', { ...data, phase: `queryA:${data.phase || ''}` }));
        await testerA.initialize();
        const resultA = await testerA.executeTestWithWarmup(testNameA, sqlTextA.trim());

        // Switch progress prefix for query B
        testerA.removeAllListeners('progress');
        testerA.on('progress', (data: Record<string, unknown>) =>
          broadcast(wss, testId, 'progress', { ...data, phase: `queryB:${data.phase || ''}` }));
        const resultB = await testerA.executeTestWithWarmup(testNameB, sqlTextB.trim());

        const delta = (resultA.statistics && resultB.statistics)
          ? computeComparisonDelta(resultA.statistics, resultB.statistics)
          : null;

        await fs.mkdir(RESULTS_DIR, { recursive: true });
        const resultPath = path.join(RESULTS_DIR, `${testId}.json`);
        await fs.writeFile(resultPath, JSON.stringify({
          type: 'comparison', testId, executionMode,
          testNameA, testNameB,
          resultA, resultB, delta,
        }, null, 2));

        broadcast(wss, testId, 'complete', {
          testId, executionMode, testNameA, testNameB,
          resultA: serializeResult(resultA),
          resultB: serializeResult(resultB),
          delta,
        });
      }
    } catch (err) {
      console.error(`[test:${testId}] Error:`, (err as Error).message);
      broadcast(wss, testId, 'error', { message: (err as Error).message });
    } finally {
      if (testerA) await testerA.cleanup().catch(() => { });
      if (testerB) await testerB.cleanup().catch(() => { });
      releaseSemaphore();
    }
  });
});

// ─── Results list ────────────────────────────────────────────────────────
router.get('/results', asyncHandler(async (_req: Request, res: Response) => {
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

  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: results });
}));

// ─── Result detail ───────────────────────────────────────────────────────
router.get('/results/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = validateId(req.params.id as string, '結果ID');
  const filePath = path.join(RESULTS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    res.json({ success: true, data: JSON.parse(raw) });
  } catch {
    res.status(404).json({ success: false, error: '結果が見つかりません' });
  }
}));

// ─── Serializer (remove circular references etc.) ────────────────────────
function serializeResult(result: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { error: 'シリアライズできませんでした' };
  }
}

export default router;
