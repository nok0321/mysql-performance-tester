/**
 * Single Tester - 単一クエリテスター
 *
 * MySQLの単一クエリに対してパフォーマンス測定を行うテスタークラス。
 * EventEmitter を継承し、進捗を 'progress' イベントで通知する。
 *
 * コンストラクタ引数:
 *   dbConfig   - createDbConfig() が返すプレーンオブジェクト
 *   testConfig - createTestConfig() が返すプレーンオブジェクト
 *   deps       - 依存オブジェクト（省略可、省略時はデフォルト実装を使用）
 *     deps.db                          - DatabaseConnection インスタンス
 *     deps.warmupManager               - WarmupManager インスタンス
 *     deps.fileManager                 - FileManager インスタンス
 *     deps.analyzers.explain           - ExplainAnalyzer インスタンス
 *     deps.analyzers.trace             - OptimizerTraceAnalyzer インスタンス
 *     deps.analyzers.bufferPool        - BufferPoolMonitor インスタンス
 *     deps.analyzers.performanceSchema - PerformanceSchemaAnalyzer インスタンス
 *
 * イベント:
 *   'progress' { phase: 'warmup'|'measuring', current, total, duration }
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { DatabaseConnection } from '../core/database-connection.js';
import { TestResult } from '../models/test-result.js';
import { ExplainAnalyzer, OptimizerTraceAnalyzer, PerformanceSchemaAnalyzer, BufferPoolMonitor } from '../analyzers/index.js';
import { WarmupManager } from '../warmup/index.js';
import { FileManager } from '../storage/file-manager.js';

export class MySQLPerformanceTester extends EventEmitter {
  /**
   * @param {Object} dbConfig   - createDbConfig() が返すプレーンオブジェクト
   * @param {Object} testConfig - createTestConfig() が返すプレーンオブジェクト
   * @param {Object} [deps={}]  - 依存の注入（テスト用途・高度なカスタマイズ）
   *   deps.db                      - DatabaseConnection インスタンス
   *   deps.warmupManager           - WarmupManager インスタンス
   *   deps.fileManager             - FileManager インスタンス
   *   deps.analyzers.explain       - ExplainAnalyzer インスタンス
   *   deps.analyzers.trace         - OptimizerTraceAnalyzer インスタンス
   *   deps.analyzers.bufferPool    - BufferPoolMonitor インスタンス
   *   deps.analyzers.performanceSchema - PerformanceSchemaAnalyzer インスタンス
   */
  constructor(dbConfig, testConfig, deps = {}) {
    super();
    this.dbConfig   = dbConfig;
    this.testConfig = testConfig;
    this.testResults = [];

    // 依存の注入（省略時はデフォルト実装）
    this.db            = deps.db            ?? null;
    this.warmupManager = deps.warmupManager ?? new WarmupManager(testConfig);
    this.fileManager   = deps.fileManager   ?? new FileManager(testConfig.fileManager);

    // アナライザーは this.db が確定する initialize() まで保留
    // deps.analyzers で個別に上書き可能（テスト用モックの注入等）
    this._analyzerDeps = deps.analyzers ?? {};
    this.analyzers     = null; // initialize() 後に設定される
    this._initialized  = false;
  }

  /**
   * initialize() が完了していることを確認する
   * @throws {Error} 未初期化の場合
   */
  _assertInitialized() {
    if (!this._initialized) {
      throw new Error(
        'MySQLPerformanceTester.initialize() を呼び出してから使用してください。' +
        '"await tester.initialize()" が正常に完了していることを確認してください。'
      );
    }
  }

  /**
   * テスターの初期化
   * - DB接続を確立し、アナライザーをすべて初期化する
   */
  async initialize() {
    console.log('\n' + '='.repeat(60));
    console.log('MySQL Performance Tester'.padStart(40));
    console.log('='.repeat(60));

    this.db ??= new DatabaseConnection(this.dbConfig);
    await this.db.initialize();

    const connected = await this.db.testConnection();
    if (!connected) {
      throw new Error('データベース接続に失敗しました');
    }

    console.log('✓ データベース接続成功');

    await this.fileManager.initialize();

    // アナライザーを initialize() 時に一度だけ生成する。
    // deps.analyzers で個別インスタンスが注入されていればそちらを優先する。
    this.analyzers = {
      explain:          this._analyzerDeps.explain          ?? new ExplainAnalyzer(this.db, this.testConfig),
      trace:            this._analyzerDeps.trace            ?? new OptimizerTraceAnalyzer(this.db, this.testConfig),
      bufferPool:       this._analyzerDeps.bufferPool       ?? new BufferPoolMonitor(this.db, this.testConfig),
      performanceSchema: this._analyzerDeps.performanceSchema ?? new PerformanceSchemaAnalyzer(this.db, this.testConfig),
    };

    this._initialized = true;
    console.log();
    return this;
  }

  /**
   * 単一クエリの実行（ウォームアップあり）
   */
  async executeTestWithWarmup(testName, query) {
    this._assertInitialized();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`テスト: ${testName}`);
    console.log(`${'='.repeat(60)}`);

    const testResult = new TestResult(testName, query);

    // ウォームアップフェーズ
    if (this.testConfig.enableWarmup) {
      this.emit('progress', {
        phase:    'warmup',
        current:  0,
        total:    this.testConfig.testIterations,
        duration: null,
      });

      const warmupResult = await this.warmupManager.execute(
        async () => await this.executeSingleQuery(query),
        this.testConfig.testIterations,
        { silent: false }
      );
      testResult.warmupResult = warmupResult;
    }

    // 本番測定
    console.log(`\n📊 本番測定開始 (${this.testConfig.testIterations}回)`);
    const startTime = performance.now();

    for (let i = 0; i < this.testConfig.testIterations; i++) {
      const result = await this.executeSingleQuery(query);
      testResult.addResult(result);

      this.emit('progress', {
        phase:    'measuring',
        current:  i + 1,
        total:    this.testConfig.testIterations,
        duration: result.duration,
      });

      if ((i + 1) % Math.max(1, Math.floor(this.testConfig.testIterations / 5)) === 0) {
        console.log(`   進捗: ${i + 1}/${this.testConfig.testIterations} (${((i + 1) / this.testConfig.testIterations * 100).toFixed(0)}%)`);
      }
    }

    const totalDuration = performance.now() - startTime;
    console.log(`✓ 測定完了 (所要時間: ${totalDuration.toFixed(2)}ms)\n`);

    testResult.calculateStatistics(this.testConfig);

    await this.runAnalysis(testResult, query);

    this.testResults.push(testResult);
    this.printTestSummary(testResult);

    return testResult;
  }

  /**
   * 単一クエリの実行（ウォームアップなし）
   */
  async executeTest(testName, query) {
    this._assertInitialized();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`テスト: ${testName}`);
    console.log(`${'='.repeat(60)}`);

    const testResult = new TestResult(testName, query);

    console.log(`\n📊 測定開始 (${this.testConfig.testIterations}回)`);
    const startTime = performance.now();

    for (let i = 0; i < this.testConfig.testIterations; i++) {
      const result = await this.executeSingleQuery(query);
      testResult.addResult(result);

      this.emit('progress', {
        phase:    'measuring',
        current:  i + 1,
        total:    this.testConfig.testIterations,
        duration: result.duration,
      });

      if ((i + 1) % Math.max(1, Math.floor(this.testConfig.testIterations / 5)) === 0) {
        console.log(`   進捗: ${i + 1}/${this.testConfig.testIterations} (${((i + 1) / this.testConfig.testIterations * 100).toFixed(0)}%)`);
      }
    }

    const totalDuration = performance.now() - startTime;
    console.log(`✓ 測定完了 (所要時間: ${totalDuration.toFixed(2)}ms)\n`);

    testResult.calculateStatistics(this.testConfig);

    await this.runAnalysis(testResult, query);

    this.testResults.push(testResult);
    this.printTestSummary(testResult);

    return testResult;
  }

  /**
   * 単一クエリの実行
   */
  async executeSingleQuery(query) {
    this._assertInitialized();
    const startTime = performance.now();

    try {
      const [rows] = await this.db.execute(query);
      const duration = performance.now() - startTime;

      return {
        success:   true,
        duration,
        rowCount:  rows.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = performance.now() - startTime;

      return {
        success:   false,
        duration,
        error:     error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 各種分析の実行
   * アナライザーは initialize() 時に生成済みの this.analyzers を使用する。
   */
  async runAnalysis(testResult, query) {
    this._assertInitialized();
    console.log('🔍 分析実行中...');

    // EXPLAIN分析
    testResult.explainAnalyze = await this.analyzers.explain.analyzeQuery(query);

    // EXPLAIN ANALYZE（MySQL 8.0.18+）
    if (this.testConfig.enableExplainAnalyze && this.db.supportsExplainAnalyze) {
      const explainAnalyzeResult = await this.analyzers.explain.analyzeQueryWithExecution(query);
      if (explainAnalyzeResult) {
        testResult.explainAnalyze = {
          ...testResult.explainAnalyze,
          analyze: explainAnalyzeResult,
        };
        await this.fileManager.saveExplainAnalyze(explainAnalyzeResult, testResult.testName);
      }
    }

    // Optimizer Trace
    if (this.testConfig.enableOptimizerTrace) {
      testResult.optimizerTrace = await this.analyzers.trace.captureTrace(query);
      if (testResult.optimizerTrace) {
        await this.fileManager.saveOptimizerTrace(testResult.optimizerTrace, testResult.testName);
      }
    }

    // Buffer Pool監視
    if (this.testConfig.enableBufferPoolMonitoring) {
      testResult.bufferPoolAnalysis = await this.analyzers.bufferPool.analyze();
    }

    // Performance Schema
    if (this.testConfig.enablePerformanceSchema) {
      testResult.performanceSchemaMetrics = await this.analyzers.performanceSchema.collectMetrics();
    }

    if (testResult.explainAnalyze && testResult.explainAnalyze.data) {
      await this.fileManager.saveQueryPlan(testResult.explainAnalyze.data, testResult.testName);
    }

    console.log('✓ 分析完了\n');
  }

  /**
   * テスト結果サマリーの表示
   */
  printTestSummary(testResult) {
    console.log('📈 テスト結果サマリー');
    console.log('-'.repeat(60));

    if (testResult.warmupResult) {
      const warmup = testResult.warmupResult;
      console.log(`\nウォームアップ:`);
      console.log(`  実行回数: ${warmup.count}回`);
      console.log(`  成功率: ${(warmup.successCount / warmup.count * 100).toFixed(2)}%`);
      console.log(`  平均時間: ${warmup.averageDuration}ms`);

      if (warmup.cacheEffectiveness) {
        console.log(`  キャッシュ効果: ${warmup.cacheEffectiveness.effectivenessRating}`);
        console.log(`  改善率: ${warmup.cacheEffectiveness.improvementPercentage}%`);
      }
    }

    if (testResult.statistics) {
      const stats = testResult.statistics;
      console.log(`\n実行回数:`);
      console.log(`  合計: ${stats.count.total}回`);
      console.log(`  測定に使用: ${stats.count.included}回`);
      if (stats.count.outliers > 0) {
        console.log(`  外れ値除外: ${stats.count.outliers}回 (${((stats.count.outliers / stats.count.total) * 100).toFixed(2)}%)`);
      }

      console.log(`\n基本統計:`);
      console.log(`  平均: ${stats.basic.mean}ms`);
      console.log(`  中央値: ${stats.basic.median}ms`);
      console.log(`  最小: ${stats.basic.min}ms`);
      console.log(`  最大: ${stats.basic.max}ms`);

      console.log(`\nパーセンタイル:`);
      console.log(`  P50 (中央値): ${stats.percentiles.p50}ms`);
      console.log(`  P75: ${stats.percentiles.p75}ms`);
      console.log(`  P90: ${stats.percentiles.p90}ms`);
      console.log(`  P95: ${stats.percentiles.p95}ms ⭐`);
      console.log(`  P99: ${stats.percentiles.p99}ms`);
      console.log(`  P99.9: ${stats.percentiles.p999}ms`);

      console.log(`\n分散:`);
      console.log(`  標準偏差: ${stats.spread.stdDev}ms`);
      console.log(`  変動係数: ${stats.spread.cv}%`);
      console.log(`  IQR: ${stats.spread.iqr}ms`);
    }

    if (testResult.bufferPoolAnalysis) {
      const bp = testResult.bufferPoolAnalysis.metrics;
      console.log(`\nBuffer Pool:`);
      console.log(`  ヒット率: ${bp.hitRatio}%`);
      console.log(`  総ページ: ${bp.pagesTotal}`);
      console.log(`  空きページ: ${bp.pagesFree}`);
    }

    if (testResult.performanceSchemaMetrics) {
      const ps = testResult.performanceSchemaMetrics;

      if (ps.connections) {
        console.log(`\n接続状況:`);
        console.log(`  接続中: ${ps.connections.Threads_connected}`);
        console.log(`  実行中: ${ps.connections.Threads_running}`);
      }

      if (ps.topQueries && ps.topQueries.length > 0) {
        console.log(`\nトップクエリ (上位3件):`);
        ps.topQueries.slice(0, 3).forEach((q, i) => {
          console.log(`  ${i + 1}. 平均: ${q.avgLatency}ms, 実行回数: ${q.executionCount}`);
        });
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  /**
   * FileManagerのサマリーを表示
   */
  printFileManagerSummary() {
    this._assertInitialized();
    const summary = this.fileManager.getSummary();

    if (!summary.enabled) {
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📁 デバッグファイル出力サマリー'.padStart(40));
    console.log('='.repeat(60));
    console.log(`出力ディレクトリ: ${summary.outputDir}`);
    console.log(`\n出力ファイル数:`);
    console.log(`  EXPLAIN ANALYZE: ${summary.counters.explainAnalyze}件`);
    console.log(`  Optimizer Trace: ${summary.counters.optimizerTrace}件`);
    console.log(`  Query Plan: ${summary.counters.queryPlan}件`);
    console.log(`  その他: ${summary.counters.general}件`);
    console.log(`  合計: ${summary.totalFiles}件`);
    console.log('='.repeat(60));
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    if (this.db) {
      await this.db.close();
    }
    console.log('✓ クリーンアップ完了');
  }

  /**
   * テスト結果を取得
   */
  getTestResults() {
    return this.testResults;
  }
}

export default MySQLPerformanceTester;
