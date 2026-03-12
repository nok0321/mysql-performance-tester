/**
 * 並列パフォーマンステスター
 *
 * コンストラクタ引数:
 *   dbConfig   - createDbConfig() が返すプレーンオブジェクト
 *   testConfig - createTestConfig() が返すプレーンオブジェクト
 *   deps       - 依存の注入（省略可）
 *     deps.db - DatabaseConnection インスタンス
 *
 * イベント:
 *   'progress' { phase: 'running', current, total }
 */

import { EventEmitter } from 'events';
import { DatabaseConnection } from '../core/database-connection.js';
import { SQLFileManager } from '../parallel/sql-file-manager.js';
import {
  RandomDistributionStrategy,
  RoundRobinDistributionStrategy,
  SequentialDistributionStrategy,
  CategoryBasedDistributionStrategy,
} from '../parallel/distribution-strategy.js';
import { ParallelExecutor } from '../parallel/parallel-executor.js';

export class ParallelPerformanceTester extends EventEmitter {
  /**
   * @param {Object} dbConfig   - createDbConfig() が返すプレーンオブジェクト
   * @param {Object} testConfig - createTestConfig() が返すプレーンオブジェクト
   * @param {Object} [deps={}]  - 依存の注入
   *   deps.db               - DatabaseConnection インスタンス
   *   deps.parallelExecutor - ParallelExecutor インスタンス
   *   deps.sqlFileManager   - SQLFileManager インスタンス（executeParallelTestsFromFiles 用）
   *   deps.strategyFactory  - (sqlFileManager) => Array<{name, strategy}> （配布戦略一覧を返すファクトリ）
   */
  constructor(dbConfig, testConfig, deps = {}) {
    super();
    this.dbConfig   = dbConfig;
    this.testConfig = testConfig;

    this.db                   = deps.db               ?? null;
    this._parallelExecutorDep = deps.parallelExecutor ?? null;
    this._sqlFileManagerDep   = deps.sqlFileManager   ?? null;
    this._strategyFactoryDep  = deps.strategyFactory  ?? null;
    this.parallelExecutor     = null; // initialize() 後に設定される
    this._initialized         = false;
  }

  /**
   * initialize() が完了していることを確認する
   * @throws {Error} 未初期化の場合
   */
  _assertInitialized() {
    if (!this._initialized) {
      throw new Error(
        'ParallelPerformanceTester.initialize() を呼び出してから使用してください。' +
        '"await tester.initialize()" が正常に完了していることを確認してください。'
      );
    }
  }

  /**
   * 初期化
   * - DB接続を確立し、ParallelExecutor を生成する
   */
  async initialize() {
    this.db ??= new DatabaseConnection(this.dbConfig);
    await this.db.initialize();
    // deps.parallelExecutor が注入されていればそちらを優先する
    this.parallelExecutor = this._parallelExecutorDep ?? new ParallelExecutor(this.db.pool);
    this._initialized = true;
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    if (this.db) {
      await this.db.close();
    }
  }

  /**
   * 複数SQLファイルの並列負荷テスト
   */
  async executeParallelTestsFromFiles(parallelSQLDir = './parallel') {
    this._assertInitialized();
    console.log(`\n${'='.repeat(60)}`);
    console.log('複数SQLファイル並列負荷テスト'.padStart(40));
    console.log(`${'='.repeat(60)}`);

    // deps.sqlFileManager が注入されている場合はそちらを優先する。
    // 注入された場合 parallelSQLDir は無視される（注入済みマネージャーが既にロード済みのため）。
    const sqlFileManager = this._sqlFileManagerDep ?? new SQLFileManager(parallelSQLDir);
    const loaded = await sqlFileManager.loadSQLFiles();

    if (!loaded || sqlFileManager.getFileCount() === 0) {
      console.log(`\n⚠️ 並列実行用SQLファイルが見つかりません: ${parallelSQLDir}`);
      console.log(`ヒント: ${parallelSQLDir} ディレクトリに.sqlファイルを配置してください`);
      return null;
    }

    // deps.strategyFactory が注入されている場合はそちらを優先する。
    // ファクトリは (sqlFileManager) => Array<{name: string, strategy: DistributionStrategy}> の形式。
    const distributionStrategies = this._strategyFactoryDep
      ? this._strategyFactoryDep(sqlFileManager)
      : [
          { name: 'Random',        strategy: new RandomDistributionStrategy(sqlFileManager) },
          { name: 'RoundRobin',    strategy: new RoundRobinDistributionStrategy(sqlFileManager) },
          { name: 'Sequential',    strategy: new SequentialDistributionStrategy(sqlFileManager) },
          { name: 'CategoryBased', strategy: new CategoryBasedDistributionStrategy(sqlFileManager) },
        ];

    this.emit('progress', {
      phase:   'running',
      current: 0,
      total:   this.testConfig.parallelThreads * this.testConfig.testIterations,
    });

    const allResults = {};

    for (const { name, strategy } of distributionStrategies) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`配布戦略: ${name}`);
      console.log(`${'─'.repeat(60)}`);

      const result = await this.executeWithDistributionStrategy(
        sqlFileManager,
        strategy,
        name
      );

      allResults[name] = result;

      await this.sleep(1000);
    }

    this.printDistributionStrategyComparison(allResults);

    return allResults;
  }

  /**
   * 配布戦略を使った並列実行
   */
  async executeWithDistributionStrategy(sqlFileManager, strategy, strategyName) {
    const parallelThreads = this.testConfig.parallelThreads || 10;
    const testIterations  = this.testConfig.testIterations  || 20;

    console.log(`\nスレッド数: ${parallelThreads}`);
    console.log(`各スレッドの実行回数: ${testIterations}`);
    console.log(`総クエリ実行回数: ${parallelThreads * testIterations}`);
    console.log(`SQLファイル数: ${sqlFileManager.getFileCount()}`);

    const metrics = await this.parallelExecutor.executeWithPromiseAll(
      parallelThreads,
      testIterations,
      strategy
    );

    this.printDistributionStrategyResults(strategyName, metrics);

    return {
      strategy: strategyName,
      metrics:  metrics.toJSON(),
      sqlFiles: sqlFileManager.getSQLFiles().map(f => ({
        name:     f.fileName,
        category: f.category,
      })),
    };
  }

  /**
   * 配布戦略の結果表示
   */
  printDistributionStrategyResults(strategyName, metrics) {
    console.log(`\n📊 ${strategyName} 戦略 結果サマリー`);
    console.log('-'.repeat(60));

    const json = metrics.toJSON();

    console.log(`\n実行時間: ${json.duration.total.toFixed(2)}ms`);
    console.log(`\nクエリ数:`);
    console.log(`  合計: ${json.queries.total}`);
    console.log(`  成功: ${json.queries.completed}`);
    console.log(`  失敗: ${json.queries.failed}`);
    console.log(`  成功率: ${json.queries.successRate}`);

    console.log(`\nスループット:`);
    console.log(`  QPS: ${json.throughput.qps} queries/sec`);
    console.log(`  実効QPS: ${json.throughput.effectiveQps} queries/sec`);

    if (json.latency) {
      console.log(`\nレイテンシ:`);
      console.log(`  P50: ${json.latency.percentiles.p50}ms`);
      console.log(`  P95: ${json.latency.percentiles.p95}ms ⭐`);
      console.log(`  P99: ${json.latency.percentiles.p99}ms`);
    }
  }

  /**
   * 配布戦略間の比較
   */
  printDistributionStrategyComparison(results) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('配布戦略比較レポート'.padStart(40));
    console.log('='.repeat(60));

    const strategies = Object.values(results).filter(r => r.metrics);

    if (strategies.length === 0) {
      console.log('比較可能な結果がありません');
      return;
    }

    strategies.sort((a, b) =>
      (b.metrics.throughput?.qps || 0) - (a.metrics.throughput?.qps || 0)
    );

    console.log(`\n🏆 スループット（QPS）ランキング:`);
    strategies.forEach((result, index) => {
      const qps = result.metrics.throughput?.qps || 0;
      const p95 = result.metrics.latency?.percentiles?.p95 || 'N/A';
      console.log(`  ${index + 1}. ${result.strategy}: ${qps.toFixed(2)} QPS (P95: ${p95}ms)`);
    });

    const withLatency = strategies.filter(s => s.metrics.latency);
    withLatency.sort((a, b) =>
      (a.metrics.latency.percentiles.p95 || 0) - (b.metrics.latency.percentiles.p95 || 0)
    );

    console.log(`\n⚡ レイテンシ（P95）ランキング:`);
    withLatency.forEach((result, index) => {
      const p95 = result.metrics.latency.percentiles.p95;
      const qps = result.metrics.throughput.qps;
      console.log(`  ${index + 1}. ${result.strategy}: ${p95}ms (QPS: ${qps.toFixed(2)})`);
    });

    console.log(`\n💡 推奨事項:`);
    const bestThroughput = strategies[0];
    const bestLatency    = withLatency[0];

    if (bestThroughput.strategy === bestLatency?.strategy) {
      console.log(`  "${bestThroughput.strategy}" が最もバランスが良い配布戦略です`);
    } else {
      console.log(`  スループット重視: "${bestThroughput.strategy}"`);
      if (bestLatency) {
        console.log(`  レイテンシ重視: "${bestLatency.strategy}"`);
      }
    }

    console.log('\n' + '='.repeat(60));
  }

  /**
   * 単一SQLの並列テスト実行
   */
  async executeParallelTests(testName, query) {
    this._assertInitialized();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`並列負荷テスト: ${testName}`.padStart(40));
    console.log(`${'='.repeat(60)}`);

    const parallelThreads = this.testConfig.parallelThreads || 10;
    const testIterations  = this.testConfig.testIterations  || 20;

    console.log(`\n実行戦略: Promise.all`);
    console.log(`並列度: ${parallelThreads}`);
    console.log(`各スレッドの実行回数: ${testIterations}`);

    const metrics = await this.executeParallelQuery(query, parallelThreads, testIterations);

    const result = {
      strategy: 'Promise.all',
      metrics:  metrics.toJSON(),
    };

    this.printStrategyResults(testName, result);

    return result;
  }

  /**
   * 並列クエリ実行
   */
  async executeParallelQuery(query, parallelThreads, testIterations) {
    this._assertInitialized();
    return await this.parallelExecutor.executeWithPromiseAll(
      parallelThreads,
      testIterations,
      {
        selectSQLFile: () => ({ content: query, fileName: 'inline-query', category: 'inline' }),
      }
    );
  }

  /**
   * 戦略結果の表示
   */
  printStrategyResults(testName, result) {
    console.log(`\n📊 ${testName} - ${result.strategy} 結果サマリー`);
    console.log('-'.repeat(60));

    const metrics = result.metrics;

    console.log(`\n実行時間: ${metrics.duration.total.toFixed(2)}ms`);
    console.log(`\nクエリ数:`);
    console.log(`  合計: ${metrics.queries.total}`);
    console.log(`  成功: ${metrics.queries.completed}`);
    console.log(`  失敗: ${metrics.queries.failed}`);
    console.log(`  成功率: ${metrics.queries.successRate}`);

    console.log(`\nスループット:`);
    console.log(`  QPS: ${metrics.throughput.qps} queries/sec`);
    console.log(`  実効QPS: ${metrics.throughput.effectiveQps} queries/sec`);

    if (metrics.latency) {
      console.log(`\nレイテンシ:`);
      console.log(`  P50: ${metrics.latency.percentiles.p50}ms`);
      console.log(`  P95: ${metrics.latency.percentiles.p95}ms ⭐`);
      console.log(`  P99: ${metrics.latency.percentiles.p99}ms`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ParallelPerformanceTester;
