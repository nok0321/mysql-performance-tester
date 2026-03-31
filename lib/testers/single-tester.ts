/**
 * Single Tester - Single query tester
 *
 * Performance measurement tester class for single MySQL queries.
 * Extends EventEmitter to notify progress via 'progress' events.
 *
 * Constructor arguments:
 *   dbConfig   - Plain object returned by createDbConfig()
 *   testConfig - Plain object returned by createTestConfig()
 *   deps       - Dependency injection object (optional, uses defaults when omitted)
 *
 * Events:
 *   'progress' { phase: 'warmup'|'measuring', current, total, duration }
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { DatabaseConnection } from '../core/database-connection.js';
import { TestResult } from '../models/test-result.js';
import type { ExecutionResult } from '../models/test-result.js';
import { ExplainAnalyzer, OptimizerTraceAnalyzer, PerformanceSchemaAnalyzer, BufferPoolMonitor } from '../analyzers/index.js';
import { WarmupManager } from '../warmup/index.js';
import type { WarmupSummary } from '../warmup/warmup-manager.js';
import { FileManager } from '../storage/file-manager.js';
import type { DbConfig, TestConfig, ExplainAnalyzeResult } from '../types/index.js';

/** Analyzers container */
interface Analyzers {
    explain: ExplainAnalyzer;
    trace: OptimizerTraceAnalyzer;
    bufferPool: BufferPoolMonitor;
    performanceSchema: PerformanceSchemaAnalyzer;
}

/** Partial analyzers for dependency injection */
interface AnalyzerDeps {
    explain?: ExplainAnalyzer;
    trace?: OptimizerTraceAnalyzer;
    bufferPool?: BufferPoolMonitor;
    performanceSchema?: PerformanceSchemaAnalyzer;
}

/** Dependency injection options */
interface SingleTesterDeps {
    db?: DatabaseConnection;
    warmupManager?: WarmupManager;
    fileManager?: FileManager;
    analyzers?: AnalyzerDeps;
}

/** Progress event payload */
export interface ProgressEvent {
    phase: 'warmup' | 'measuring';
    current: number;
    total: number;
    duration: number | null;
}

export class MySQLPerformanceTester extends EventEmitter {
    private dbConfig: DbConfig;
    private testConfig: TestConfig;
    private testResults: TestResult[];
    private db: DatabaseConnection | null;
    private warmupManager: WarmupManager;
    private fileManager: FileManager;
    private _analyzerDeps: AnalyzerDeps;
    private analyzers: Analyzers | null;
    private _initialized: boolean;

    constructor(dbConfig: DbConfig, testConfig: TestConfig, deps: SingleTesterDeps = {}) {
        super();
        this.dbConfig   = dbConfig;
        this.testConfig = testConfig;
        this.testResults = [];

        // Dependency injection (use defaults when omitted)
        this.db            = deps.db            ?? null;
        this.warmupManager = deps.warmupManager ?? new WarmupManager({
            warmupIterations: testConfig.warmupIterations ?? undefined,
            warmupPercentage: testConfig.warmupPercentage,
        });
        this.fileManager   = deps.fileManager   ?? new FileManager({
            outputDir: testConfig.fileManager?.outputDir,
            enableDebugOutput: testConfig.fileManager?.enableDebugOutput,
            enableTimestamp: testConfig.fileManager?.enableTimestamp,
            maxFileSize: testConfig.fileManager?.maxFileSize,
        });

        // Analyzers are deferred until initialize() when this.db is available
        // Individual analyzers can be overridden via deps.analyzers (for mock injection, etc.)
        this._analyzerDeps = deps.analyzers ?? {};
        this.analyzers     = null; // Set after initialize()
        this._initialized  = false;
    }

    /**
     * Assert that initialize() has completed
     * @throws Error if not initialized
     */
    private _assertInitialized(): void {
        if (!this._initialized) {
            throw new Error(
                'MySQLPerformanceTester.initialize() を呼び出してから使用してください。' +
                '"await tester.initialize()" が正常に完了していることを確認してください。'
            );
        }
    }

    /**
     * Initialize the tester
     * Establishes DB connection and initializes all analyzers
     */
    async initialize(): Promise<MySQLPerformanceTester> {
        console.log('\n' + '='.repeat(60));
        console.log('MySQL Performance Tester'.padStart(40));
        console.log('='.repeat(60));

        this.db ??= new DatabaseConnection(this.dbConfig);
        await this.db.initialize();

        const connected = await this.db.testConnection();
        if (!connected) {
            throw new Error('Database connection failed');
        }

        console.log('✓ データベース接続成功');

        await this.fileManager.initialize();

        // Create analyzers once during initialize().
        // Individually injected instances via deps.analyzers take precedence.
        this.analyzers = {
            explain:           this._analyzerDeps.explain           ?? new ExplainAnalyzer(this.db, this.testConfig),
            trace:             this._analyzerDeps.trace             ?? new OptimizerTraceAnalyzer(this.db, this.testConfig),
            bufferPool:        this._analyzerDeps.bufferPool        ?? new BufferPoolMonitor(this.db, this.testConfig),
            performanceSchema: this._analyzerDeps.performanceSchema ?? new PerformanceSchemaAnalyzer(this.db, this.testConfig),
        };

        this._initialized = true;
        console.log();
        return this;
    }

    /**
     * Execute a single query test (with warmup)
     */
    async executeTestWithWarmup(testName: string, query: string): Promise<TestResult> {
        this._assertInitialized();
        console.log(`\n${'='.repeat(60)}`);
        console.log(`テスト: ${testName}`);
        console.log(`${'='.repeat(60)}`);

        const testResult = new TestResult(testName, query);

        // Warmup phase
        if (this.testConfig.enableWarmup) {
            this.emit('progress', {
                phase:    'warmup',
                current:  0,
                total:    this.testConfig.testIterations,
                duration: null,
            });

            const warmupResult = await this.warmupManager.execute(
                async () => { await this.executeSingleQuery(query); },
                this.testConfig.testIterations,
                { silent: false }
            );
            testResult.warmupResult = warmupResult;
        }

        // Production measurement
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
     * Execute a single query test (without warmup)
     */
    async executeTest(testName: string, query: string): Promise<TestResult> {
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
     * Execute a single query
     */
    async executeSingleQuery(query: string): Promise<ExecutionResult> {
        this._assertInitialized();
        const startTime = performance.now();

        try {
            const [rows] = await this.db!.execute(query);
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
                error:     (error as Error).message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Run various analyses.
     * Uses analyzers created during initialize().
     */
    async runAnalysis(testResult: TestResult, query: string): Promise<void> {
        this._assertInitialized();
        console.log('🔍 分析実行中...');

        // EXPLAIN analysis
        testResult.explainAnalyze = await this.analyzers!.explain.analyzeQuery(query);

        // EXPLAIN ANALYZE (MySQL 8.0.18+)
        if (this.testConfig.enableExplainAnalyze && this.db!.isExplainAnalyzeSupported()) {
            const explainAnalyzeResult = await this.analyzers!.explain.analyzeQueryWithExecution(query);
            if (explainAnalyzeResult && testResult.explainAnalyze) {
                testResult.explainAnalyze = {
                    ...testResult.explainAnalyze,
                    ...explainAnalyzeResult,
                } as ExplainAnalyzeResult;
                await this.fileManager.saveExplainAnalyze({ ...explainAnalyzeResult }, testResult.testName);
            }
        }

        // Optimizer Trace
        if (this.testConfig.enableOptimizerTrace) {
            testResult.optimizerTrace = await this.analyzers!.trace.captureTrace(query);
            if (testResult.optimizerTrace) {
                await this.fileManager.saveOptimizerTrace({ ...testResult.optimizerTrace }, testResult.testName);
            }
        }

        // Buffer Pool monitoring
        if (this.testConfig.enableBufferPoolMonitoring) {
            testResult.bufferPoolAnalysis = await this.analyzers!.bufferPool.analyze();
        }

        // Performance Schema
        if (this.testConfig.enablePerformanceSchema) {
            testResult.performanceSchemaMetrics = await this.analyzers!.performanceSchema.collectMetrics();
        }

        if (testResult.explainAnalyze && 'data' in testResult.explainAnalyze && testResult.explainAnalyze.data) {
            await this.fileManager.saveQueryPlan(
                testResult.explainAnalyze.data,
                testResult.testName
            );
        }

        console.log('✓ 分析完了\n');
    }

    /**
     * Print test result summary
     */
    printTestSummary(testResult: TestResult): void {
        console.log('📈 テスト結果サマリー');
        console.log('-'.repeat(60));

        if (testResult.warmupResult) {
            const warmup = testResult.warmupResult as WarmupSummary;
            console.log(`\nウォームアップ:`);
            console.log(`  実行回数: ${warmup.count}回`);
            console.log(`  成功率: ${(warmup.successCount / warmup.count * 100).toFixed(2)}%`);
            console.log(`  平均時間: ${warmup.averageDuration}ms`);

            if (warmup.cacheEffectiveness) {
                const ce = warmup.cacheEffectiveness;
                console.log(`  キャッシュ効果: ${ce.effectivenessRating}`);
                console.log(`  改善率: ${ce.improvementPercentage}%`);
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
                const conn = ps.connections;
                console.log(`\n接続状況:`);
                console.log(`  接続中: ${conn.Threads_connected}`);
                console.log(`  実行中: ${conn.Threads_running}`);
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
     * Print FileManager summary
     */
    printFileManagerSummary(): void {
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
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        if (this.db) {
            await this.db.close();
        }
        console.log('✓ クリーンアップ完了');
    }

    /**
     * Get test results
     */
    getTestResults(): TestResult[] {
        return this.testResults;
    }
}

export default MySQLPerformanceTester;
