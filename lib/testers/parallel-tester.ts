/**
 * Parallel performance tester
 *
 * Constructor arguments:
 *   dbConfig   - Plain object returned by createDbConfig()
 *   testConfig - Plain object returned by createTestConfig()
 *   deps       - Dependency injection (optional)
 *
 * Events:
 *   'progress' { phase: 'running', current, total }
 */

import { EventEmitter } from 'events';
import type { Pool } from 'mysql2/promise';
import { DatabaseConnection } from '../core/database-connection.js';
import { SQLFileManager } from '../parallel/sql-file-manager.js';
import type { SQLFile } from '../parallel/sql-file-manager.js';
import {
    RandomDistributionStrategy,
    RoundRobinDistributionStrategy,
    SequentialDistributionStrategy,
    CategoryBasedDistributionStrategy,
    DistributionStrategy,
} from '../parallel/distribution-strategy.js';
import { ParallelExecutor, ConcurrentLoadMetrics } from '../parallel/parallel-executor.js';
import type { ConcurrentLoadMetricsJSON } from '../parallel/parallel-executor.js';
import type { DbConfig, TestConfig } from '../types/index.js';

/** Named strategy entry */
interface NamedStrategy {
    name: string;
    strategy: DistributionStrategy;
}

/** Strategy factory function type */
type StrategyFactory = (sqlFileManager: SQLFileManager) => NamedStrategy[];

/** Dependency injection options */
interface ParallelTesterDeps {
    db?: DatabaseConnection;
    parallelExecutor?: ParallelExecutor;
    sqlFileManager?: SQLFileManager;
    strategyFactory?: StrategyFactory;
}

/** Result of a distribution strategy execution */
interface DistributionStrategyResult {
    strategy: string;
    metrics: ConcurrentLoadMetricsJSON;
    sqlFiles: Array<{ name: string; category: string }>;
}

/** Result of a single-query parallel test */
interface ParallelTestResult {
    strategy: string;
    metrics: ConcurrentLoadMetricsJSON;
}

/** All distribution strategy results keyed by strategy name */
type AllStrategyResults = Record<string, DistributionStrategyResult>;

/** Progress event payload */
export interface ParallelProgressEvent {
    phase: 'running';
    current: number;
    total: number;
}

export class ParallelPerformanceTester extends EventEmitter {
    private dbConfig: DbConfig;
    private testConfig: TestConfig;
    private db: DatabaseConnection | null;
    private _parallelExecutorDep: ParallelExecutor | null;
    private _sqlFileManagerDep: SQLFileManager | null;
    private _strategyFactoryDep: StrategyFactory | null;
    private parallelExecutor: ParallelExecutor | null;
    private _initialized: boolean;

    constructor(dbConfig: DbConfig, testConfig: TestConfig, deps: ParallelTesterDeps = {}) {
        super();
        this.dbConfig   = dbConfig;
        this.testConfig = testConfig;

        this.db                   = deps.db               ?? null;
        this._parallelExecutorDep = deps.parallelExecutor ?? null;
        this._sqlFileManagerDep   = deps.sqlFileManager   ?? null;
        this._strategyFactoryDep  = deps.strategyFactory  ?? null;
        this.parallelExecutor     = null; // Set after initialize()
        this._initialized         = false;
    }

    /**
     * Assert that initialize() has completed
     * @throws Error if not initialized
     */
    private _assertInitialized(): void {
        if (!this._initialized) {
            throw new Error(
                'ParallelPerformanceTester.initialize() を呼び出してから使用してください。' +
                '"await tester.initialize()" が正常に完了していることを確認してください。'
            );
        }
    }

    /**
     * Initialize the tester
     * Establishes DB connection and creates ParallelExecutor
     */
    async initialize(): Promise<void> {
        this.db ??= new DatabaseConnection(this.dbConfig);
        await this.db.initialize();
        // Use injected parallelExecutor if provided; otherwise create one from the pool.
        // pool is private on DatabaseConnection, so we access it via type assertion.
        const pool = (this.db as unknown as { pool: Pool }).pool;
        this.parallelExecutor = this._parallelExecutorDep ?? new ParallelExecutor(pool);
        this._initialized = true;
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        if (this.db) {
            await this.db.close();
        }
    }

    /**
     * Run parallel load tests from multiple SQL files
     */
    async executeParallelTestsFromFiles(parallelSQLDir: string = './parallel'): Promise<AllStrategyResults | null> {
        this._assertInitialized();
        console.log(`\n${'='.repeat(60)}`);
        console.log('複数SQLファイル並列負荷テスト'.padStart(40));
        console.log(`${'='.repeat(60)}`);

        // Use injected sqlFileManager if provided.
        // When injected, parallelSQLDir is ignored (the manager is already loaded).
        const sqlFileManager = this._sqlFileManagerDep ?? new SQLFileManager(parallelSQLDir);
        const loaded = await sqlFileManager.loadSQLFiles();

        if (!loaded || sqlFileManager.getFileCount() === 0) {
            console.log(`\n⚠️ 並列実行用SQLファイルが見つかりません: ${parallelSQLDir}`);
            console.log(`ヒント: ${parallelSQLDir} ディレクトリに.sqlファイルを配置してください`);
            return null;
        }

        // Use injected strategyFactory if provided.
        // Factory signature: (sqlFileManager) => Array<{name, strategy}>
        const distributionStrategies: NamedStrategy[] = this._strategyFactoryDep
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

        const allResults: AllStrategyResults = {};

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
     * Execute with a specific distribution strategy
     */
    async executeWithDistributionStrategy(
        sqlFileManager: SQLFileManager,
        strategy: DistributionStrategy,
        strategyName: string
    ): Promise<DistributionStrategyResult> {
        const parallelThreads = this.testConfig.parallelThreads || 10;
        const testIterations  = this.testConfig.testIterations  || 20;

        console.log(`\nスレッド数: ${parallelThreads}`);
        console.log(`各スレッドの実行回数: ${testIterations}`);
        console.log(`総クエリ実行回数: ${parallelThreads * testIterations}`);
        console.log(`SQLファイル数: ${sqlFileManager.getFileCount()}`);

        const metrics = await this.parallelExecutor!.executeWithPromiseAll(
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
     * Print distribution strategy results
     */
    private printDistributionStrategyResults(strategyName: string, metrics: ConcurrentLoadMetrics): void {
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
     * Print comparison across distribution strategies
     */
    private printDistributionStrategyComparison(results: AllStrategyResults): void {
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
            (a.metrics.latency!.percentiles.p95 || 0) - (b.metrics.latency!.percentiles.p95 || 0)
        );

        console.log(`\n⚡ レイテンシ（P95）ランキング:`);
        withLatency.forEach((result, index) => {
            const p95 = result.metrics.latency!.percentiles.p95;
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
     * Execute parallel tests for a single SQL query
     */
    async executeParallelTests(testName: string, query: string): Promise<ParallelTestResult> {
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

        const result: ParallelTestResult = {
            strategy: 'Promise.all',
            metrics:  metrics.toJSON(),
        };

        this.printStrategyResults(testName, result);

        return result;
    }

    /**
     * Execute a parallel query
     */
    async executeParallelQuery(
        query: string,
        parallelThreads: number,
        testIterations: number
    ): Promise<ConcurrentLoadMetrics> {
        this._assertInitialized();
        return await this.parallelExecutor!.executeWithPromiseAll(
            parallelThreads,
            testIterations,
            {
                selectSQLFile: (): SQLFile | null => ({ content: query, fileName: 'inline-query', category: 'inline' } as unknown as SQLFile),
            }
        );
    }

    /**
     * Print strategy results
     */
    private printStrategyResults(testName: string, result: ParallelTestResult): void {
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

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default ParallelPerformanceTester;
