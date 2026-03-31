/**
 * Parallel execution engine
 * Manages concurrent query execution
 */

import { performance } from 'perf_hooks';
import type { Pool } from 'mysql2/promise';
import { StatisticsCalculator } from '../statistics/statistics-calculator.js';
import type { StatisticsResult } from '../types/index.js';
import type { DistributionStrategy } from './distribution-strategy.js';
import type { SQLFile } from './sql-file-manager.js';

/**
 * Maximum number of records stored in completedQueries / failedQueries.
 * Overflow records are compressed to lightweight objects with only duration.
 * Prevents OOM when parallelThreads=200 x iterations=10000 = 2M records.
 */
const MAX_STORED_RECORDS = 50_000;

/** Result of a single query execution */
interface QueryResult {
    success: boolean;
    duration: number;
    query: string;
    error?: string;
}

/** Recorded query with metadata */
interface RecordedQuery extends QueryResult {
    threadId?: number;
    iteration?: number;
    sqlFile?: string;
    category?: string;
    completedAt?: number;
}

/** Lightweight overflow record (duration and sqlFile only) */
interface OverflowRecord {
    duration: number;
    sqlFile?: string;
}

/** Per-file latency statistics in JSON output */
interface PerFileLatency {
    mean: number | undefined;
    p50: number | undefined;
    p95: number | undefined;
    p99: number | undefined;
    min: number | undefined;
    max: number | undefined;
}

/** Per-file metrics in JSON output */
interface PerFileEntry {
    total: number;
    completed: number;
    failed: number;
    successRate: string;
    latency: PerFileLatency | null;
}

/** Latency statistics including raw data */
interface LatencyStatistics extends StatisticsResult {
    rawData: number[];
}

/** JSON representation of ConcurrentLoadMetrics */
export interface ConcurrentLoadMetricsJSON {
    duration: {
        total: number;
        seconds: number;
    };
    queries: {
        total: number;
        completed: number;
        failed: number;
        successRate: string;
        completedOverflow?: number;
        failedOverflow?: number;
    };
    throughput: {
        qps: number;
        effectiveQps: number;
    };
    latency: LatencyStatistics | null;
    perFile: Record<string, PerFileEntry>;
}

/**
 * Concurrent load metrics class
 */
export class ConcurrentLoadMetrics {
    private startTime: number | null;
    private endTime: number | null;
    public completedQueries: (RecordedQuery | OverflowRecord)[];
    public failedQueries: (RecordedQuery | OverflowRecord)[];
    private inFlightQueries: number;
    private timestamps: number[];
    private _completedOverflowCount: number;
    private _failedOverflowCount: number;

    constructor() {
        this.startTime = null;
        this.endTime = null;
        this.completedQueries = [];
        this.failedQueries = [];
        this.inFlightQueries = 0;
        this.timestamps = [];
        // Counter for records exceeding MAX_STORED_RECORDS (details not stored)
        this._completedOverflowCount = 0;
        this._failedOverflowCount    = 0;
    }

    /**
     * Start measurement
     */
    start(): void {
        this.startTime = performance.now();
    }

    /**
     * End measurement
     */
    end(): void {
        this.endTime = performance.now();
    }

    /**
     * Record a query result.
     * When exceeding MAX_STORED_RECORDS, only duration and sqlFile are kept
     * to suppress memory usage (statistics only require duration).
     */
    recordQuery(result: RecordedQuery): void {
        const completedAt = performance.now();
        this.timestamps.push(completedAt);

        if (result.success) {
            if (this.completedQueries.length < MAX_STORED_RECORDS) {
                this.completedQueries.push({ ...result, completedAt });
            } else {
                // Lightweight object: keep only duration and sqlFile
                this.completedQueries.push({ duration: result.duration, sqlFile: result.sqlFile });
                this._completedOverflowCount++;
            }
        } else {
            if (this.failedQueries.length < MAX_STORED_RECORDS) {
                this.failedQueries.push({ ...result, completedAt });
            } else {
                this.failedQueries.push({ duration: result.duration, sqlFile: result.sqlFile });
                this._failedOverflowCount++;
            }
        }
    }

    /**
     * Get total execution duration
     */
    getTotalDuration(): number {
        return this.endTime! - this.startTime!;
    }

    /**
     * Get the count of completed queries
     */
    getCompletedCount(): number {
        return this.completedQueries.length;
    }

    /**
     * Get the count of failed queries
     */
    getFailedCount(): number {
        return this.failedQueries.length;
    }

    /**
     * Get total query count
     */
    getTotalCount(): number {
        return this.getCompletedCount() + this.getFailedCount();
    }

    /**
     * Calculate throughput (QPS)
     */
    getQueriesPerSecond(): number {
        const durationSeconds = this.getTotalDuration() / 1000;
        return this.getCompletedCount() / durationSeconds;
    }

    /**
     * Calculate effective throughput
     */
    getEffectiveThroughput(): number {
        if (this.completedQueries.length < 2) {
            return 0;
        }

        const sortedTimestamps = [...this.timestamps].sort((a, b) => a - b);
        const firstComplete = sortedTimestamps[0];
        const lastComplete = sortedTimestamps[sortedTimestamps.length - 1];
        const effectiveDuration = (lastComplete - firstComplete) / 1000;

        return this.getCompletedCount() / effectiveDuration;
    }

    /**
     * Calculate latency statistics
     */
    calculateLatencyStatistics(options: Record<string, unknown> = {}): LatencyStatistics | null {
        const durations = this.completedQueries.map(q => q.duration);
        if (durations.length === 0) {
            return null;
        }

        const stats = StatisticsCalculator.calculate(durations, options);
        if (!stats) {
            return null;
        }

        return {
            ...stats,
            rawData: durations
        };
    }

    /**
     * Convert to JSON representation
     */
    toJSON(): ConcurrentLoadMetricsJSON {
        const duration = this.getTotalDuration();
        const latencyStats = this.calculateLatencyStatistics();

        // Aggregate per-file breakdown
        const fileGroups: Record<string, number[]> = {};
        for (const q of this.completedQueries) {
            const key = q.sqlFile || 'unknown';
            if (!fileGroups[key]) fileGroups[key] = [];
            fileGroups[key].push(q.duration);
        }
        // Count failures per file
        const fileFailures: Record<string, number> = {};
        for (const q of this.failedQueries) {
            const key = q.sqlFile || 'unknown';
            fileFailures[key] = (fileFailures[key] || 0) + 1;
        }

        const perFile: Record<string, PerFileEntry> = {};
        for (const [fileName, durations] of Object.entries(fileGroups)) {
            const stats = StatisticsCalculator.calculate(durations, {});
            const failed = fileFailures[fileName] || 0;
            const total = durations.length + failed;
            perFile[fileName] = {
                total,
                completed: durations.length,
                failed,
                successRate: `${((durations.length / total) * 100).toFixed(1)}%`,
                latency: {
                    mean: stats?.basic?.mean,
                    p50: stats?.percentiles?.p50,
                    p95: stats?.percentiles?.p95,
                    p99: stats?.percentiles?.p99,
                    min: stats?.basic?.min,
                    max: stats?.basic?.max
                }
            };
        }
        // Add files that only have failures
        for (const [fileName, failed] of Object.entries(fileFailures)) {
            if (!perFile[fileName]) {
                perFile[fileName] = { total: failed, completed: 0, failed, successRate: '0.0%', latency: null };
            }
        }

        return {
            duration: {
                total: duration,
                seconds: duration / 1000
            },
            queries: {
                total: this.getTotalCount(),
                completed: this.getCompletedCount(),
                failed: this.getFailedCount(),
                successRate: `${((this.getCompletedCount() / this.getTotalCount()) * 100).toFixed(2)}%`,
                // Record count where details were omitted to save memory (beyond MAX_STORED_RECORDS)
                ...(this._completedOverflowCount > 0 && { completedOverflow: this._completedOverflowCount }),
                ...(this._failedOverflowCount    > 0 && { failedOverflow:    this._failedOverflowCount    }),
            },
            throughput: {
                qps: parseFloat(this.getQueriesPerSecond().toFixed(2)),
                effectiveQps: parseFloat(this.getEffectiveThroughput().toFixed(2))
            },
            latency: latencyStats,
            perFile
        };
    }
}

/** Minimal interface for an object that can select SQL files */
export interface SQLFileSelector {
    selectSQLFile(threadId: number, iteration: number, testIterations: number): SQLFile | null;
}

/**
 * Parallel execution engine
 */
export class ParallelExecutor {
    private dbPool: Pool;

    constructor(dbPool: Pool) {
        this.dbPool = dbPool;
    }

    /**
     * Execute a single query
     */
    async executeSingleQuery(query: string): Promise<QueryResult> {
        const startTime = performance.now();
        try {
            await this.dbPool.execute(query);
            const duration = performance.now() - startTime;
            return {
                success: true,
                duration,
                query
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            return {
                success: false,
                duration,
                query,
                error: (error as Error).message
            };
        }
    }

    /**
     * Execute a single thread
     */
    async executeThread(
        threadId: number,
        iterations: number,
        strategy: SQLFileSelector,
        metrics: ConcurrentLoadMetrics,
        testIterations: number
    ): Promise<void> {
        for (let iteration = 1; iteration <= iterations; iteration++) {
            // Select SQL file according to the distribution strategy
            const sqlFile = strategy.selectSQLFile(threadId, iteration, testIterations);

            if (!sqlFile) {
                console.warn(`⚠️ Thread ${threadId}: SQLファイルが選択できませんでした`);
                continue;
            }

            // Execute query
            const result = await this.executeSingleQuery(sqlFile.content);

            // Record result
            metrics.recordQuery({
                ...result,
                threadId,
                iteration,
                sqlFile: sqlFile.fileName,
                category: sqlFile.category
            });
        }
    }

    /**
     * Execute with Promise.all strategy
     */
    async executeWithPromiseAll(
        parallelThreads: number,
        testIterations: number,
        strategy: SQLFileSelector
    ): Promise<ConcurrentLoadMetrics> {
        const metrics = new ConcurrentLoadMetrics();

        console.log(`並列度: ${parallelThreads}`);
        console.log(`各スレッドの実行回数: ${testIterations}`);

        metrics.start();

        const promises: Promise<void>[] = [];
        for (let thread = 1; thread <= parallelThreads; thread++) {
            promises.push(
                this.executeThread(thread, testIterations, strategy, metrics, testIterations)
            );
        }

        await Promise.all(promises);

        metrics.end();

        return metrics;
    }

    /**
     * Execute with concurrency limit (Worker Pool pattern)
     */
    async executeWithConcurrencyLimit(
        parallelThreads: number,
        testIterations: number,
        strategy: SQLFileSelector,
        concurrencyLimit: number = 10
    ): Promise<ConcurrentLoadMetrics> {
        const metrics = new ConcurrentLoadMetrics();
        const limit = Math.min(parallelThreads, concurrencyLimit);

        console.log(`並列度制限: ${limit}`);
        console.log(`総実行回数: ${parallelThreads * testIterations}`);

        metrics.start();

        // Queue thread IDs; workers pull one at a time
        const queue: number[] = Array.from({ length: parallelThreads }, (_, i) => i + 1);

        const worker = async (): Promise<void> => {
            while (queue.length > 0) {
                const threadId = queue.shift()!;
                await this.executeThread(threadId, testIterations, strategy, metrics, testIterations);
            }
        };

        await Promise.all(Array.from({ length: limit }, () => worker()));

        metrics.end();

        return metrics;
    }

    /**
     * Execute in batches
     */
    async executeWithBatch(
        parallelThreads: number,
        testIterations: number,
        strategy: SQLFileSelector,
        batchSize: number | null = null
    ): Promise<ConcurrentLoadMetrics> {
        const metrics = new ConcurrentLoadMetrics();
        const batch = batchSize || Math.max(Math.floor(parallelThreads / 2), 1);

        console.log(`バッチサイズ: ${batch}`);
        console.log(`総実行回数: ${parallelThreads * testIterations}`);

        metrics.start();

        const totalQueries = parallelThreads * testIterations;
        let queryIndex = 0;

        while (queryIndex < totalQueries) {
            const batchPromises: Promise<void>[] = [];
            const batchEnd = Math.min(queryIndex + batch, totalQueries);

            for (let i = queryIndex; i < batchEnd; i++) {
                const threadId = Math.floor(i / testIterations) + 1;
                const iteration = (i % testIterations) + 1;

                const sqlFile = strategy.selectSQLFile(threadId, iteration, testIterations);
                if (sqlFile) {
                    const promise = this.executeSingleQuery(sqlFile.content).then(result => {
                        metrics.recordQuery({
                            ...result,
                            threadId,
                            iteration,
                            sqlFile: sqlFile.fileName,
                            category: sqlFile.category
                        });
                    });
                    batchPromises.push(promise);
                }
            }

            await Promise.all(batchPromises);
            queryIndex = batchEnd;
        }

        metrics.end();

        return metrics;
    }

    /**
     * Execute with ramp-up stages
     */
    async executeWithRampUp(
        parallelThreads: number,
        testIterations: number,
        strategy: SQLFileSelector,
        stages: number = 3
    ): Promise<ConcurrentLoadMetrics> {
        const metrics = new ConcurrentLoadMetrics();

        console.log(`ランプアップステージ: ${stages}`);
        console.log(`最終並列度: ${parallelThreads}`);

        metrics.start();

        for (let stage = 1; stage <= stages; stage++) {
            const currentConcurrency = Math.floor((parallelThreads / stages) * stage);
            console.log(`  ステージ ${stage}: 並列度 ${currentConcurrency}`);

            const promises: Promise<void>[] = [];
            for (let thread = 1; thread <= currentConcurrency; thread++) {
                promises.push(
                    this.executeThread(thread, testIterations, strategy, metrics, testIterations)
                );
            }

            await Promise.all(promises);

            // Wait briefly before the next stage
            if (stage < stages) {
                await this.#sleep(500);
            }
        }

        metrics.end();

        return metrics;
    }

    /**
     * Sleep (internal use only)
     */
    #sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
