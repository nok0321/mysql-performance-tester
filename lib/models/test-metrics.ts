/**
 * TestMetrics Model - Test metrics data model
 *
 * Holds test execution metrics
 *
 * Features:
 * - QPS/TPS calculation
 * - Latency metrics
 * - Throughput metrics
 * - Parallel performance calculation
 *
 * @module models/test-metrics
 */

/** Constructor parameters for TestMetrics */
interface TestMetricsParams {
    testName: string;
    threadCount: number;
    totalIterations: number;
}

/** Single execution result for metrics tracking */
interface MetricsExecutionResult {
    success: boolean;
    duration: number;
    error?: string;
    timestamp?: number;
}

/** Error entry recorded during execution */
interface MetricsErrorEntry {
    error: string;
    timestamp: number;
    duration: number;
}

/** Latency metrics */
export interface LatencyMetrics {
    min: number;
    max: number;
    average: number;
    median: number;
    p95: number;
    p99: number;
}

/** Throughput metrics */
export interface ThroughputMetrics {
    qps: number;
    tps: number;
    totalDurationSeconds: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    averageLatency: number;
}

/** Parallel performance metrics */
export interface ParallelPerformanceMetrics {
    threadCount: number;
    actualQPS: number;
    idealQPS: number;
    parallelEfficiency: number;
    latency: LatencyMetrics;
    throughput: ThroughputMetrics;
    totalDurationSeconds: number;
}

/** JSON representation of TestMetrics */
interface TestMetricsJSON {
    testName: string;
    threadCount: number;
    totalIterations: number;
    startTime: number | null;
    endTime: number | null;
    successCount: number;
    failureCount: number;
    metrics: {
        parallel: ParallelPerformanceMetrics;
        latency: LatencyMetrics;
        throughput: ThroughputMetrics;
    };
    errors: MetricsErrorEntry[];
}

/** Summary of test metrics */
interface TestMetricsSummary {
    testName: string;
    threadCount: number;
    qps: number;
    averageLatency: number;
    p95Latency: number;
    successRate: number;
    parallelEfficiency: number;
    totalDuration: number;
}

/**
 * Test metrics class
 */
export class TestMetrics {
    public readonly testName: string;
    public readonly threadCount: number;
    public readonly totalIterations: number;
    public startTime: number | null;
    public endTime: number | null;
    public durations: number[];
    public timestamps: number[];
    public errors: MetricsErrorEntry[];
    public successCount: number;
    public failureCount: number;

    /**
     * Initialize metrics
     * @param params - Constructor parameters
     */
    constructor({ testName, threadCount, totalIterations }: TestMetricsParams) {
        this.testName = testName;
        this.threadCount = threadCount;
        this.totalIterations = totalIterations;
        this.startTime = null;
        this.endTime = null;
        this.durations = [];
        this.timestamps = [];
        this.errors = [];
        this.successCount = 0;
        this.failureCount = 0;
    }

    /**
     * Mark the start of the test
     */
    markStart(): void {
        this.startTime = Date.now();
    }

    /**
     * Mark the end of the test
     */
    markEnd(): void {
        this.endTime = Date.now();
    }

    /**
     * Add an execution result
     * @param result - Execution result
     */
    addResult(result: MetricsExecutionResult): void {
        if (result.success) {
            this.successCount++;
            this.durations.push(result.duration);
        } else {
            this.failureCount++;
            if (result.error) {
                this.errors.push({
                    error: result.error,
                    timestamp: result.timestamp || Date.now(),
                    duration: result.duration
                });
            }
        }

        if (result.timestamp) {
            this.timestamps.push(result.timestamp);
        }
    }

    /**
     * Calculate QPS (Queries Per Second)
     * @returns QPS value
     */
    calculateQPS(): number {
        if (!this.startTime || !this.endTime) {
            return 0;
        }

        const durationSeconds = (this.endTime - this.startTime) / 1000;
        if (durationSeconds === 0) {
            return 0;
        }

        return this.round(this.successCount / durationSeconds, 2);
    }

    /**
     * Calculate TPS (Transactions Per Second)
     * Equivalent to QPS in this project for unit consistency
     * @returns TPS value
     */
    calculateTPS(): number {
        return this.calculateQPS();
    }

    /**
     * Calculate average latency
     * @returns Average latency in milliseconds
     */
    calculateAverageLatency(): number {
        if (this.durations.length === 0) {
            return 0;
        }

        const sum = this.durations.reduce((a, b) => a + b, 0);
        return this.round(sum / this.durations.length, 3);
    }

    /**
     * Calculate latency metrics
     * @returns Latency metrics object
     */
    calculateLatencyMetrics(): LatencyMetrics {
        if (this.durations.length === 0) {
            return {
                min: 0,
                max: 0,
                average: 0,
                median: 0,
                p95: 0,
                p99: 0
            };
        }

        const sorted = [...this.durations].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const average = this.calculateAverageLatency();
        const median = this.calculatePercentile(sorted, 50);
        const p95 = this.calculatePercentile(sorted, 95);
        const p99 = this.calculatePercentile(sorted, 99);

        return {
            min: this.round(min, 3),
            max: this.round(max, 3),
            average: this.round(average, 3),
            median: this.round(median, 3),
            p95: this.round(p95, 3),
            p99: this.round(p99, 3)
        };
    }

    /**
     * Calculate throughput metrics
     * @returns Throughput metrics object
     */
    calculateThroughputMetrics(): ThroughputMetrics {
        const totalDurationSeconds = this.getTotalDurationSeconds();
        const qps = this.calculateQPS();
        const successRate = this.calculateSuccessRate();

        return {
            qps: this.round(qps, 2),
            tps: this.round(qps, 2),
            totalDurationSeconds: this.round(totalDurationSeconds, 3),
            totalRequests: this.successCount + this.failureCount,
            successfulRequests: this.successCount,
            failedRequests: this.failureCount,
            successRate: this.round(successRate, 2),
            averageLatency: this.round(this.calculateAverageLatency(), 3)
        };
    }

    /**
     * Calculate parallel performance metrics
     * @returns Parallel performance metrics object
     */
    calculateParallelPerformanceMetrics(): ParallelPerformanceMetrics {
        const latency = this.calculateLatencyMetrics();
        const throughput = this.calculateThroughputMetrics();
        const totalDuration = this.getTotalDurationSeconds();

        // Ideal QPS calculated from single-thread latency
        const idealQPS = this.threadCount > 0 && latency.average > 0
            ? (1000 / latency.average) * this.threadCount
            : 0;

        // Parallel efficiency (actual QPS / ideal QPS)
        const parallelEfficiency = idealQPS > 0
            ? (throughput.qps / idealQPS) * 100
            : 0;

        return {
            threadCount: this.threadCount,
            actualQPS: throughput.qps,
            idealQPS: this.round(idealQPS, 2),
            parallelEfficiency: this.round(parallelEfficiency, 2),
            latency,
            throughput,
            totalDurationSeconds: this.round(totalDuration, 3)
        };
    }

    /**
     * Get total duration in seconds
     * @returns Total duration in seconds
     */
    getTotalDurationSeconds(): number {
        if (!this.startTime || !this.endTime) {
            return 0;
        }
        return (this.endTime - this.startTime) / 1000;
    }

    /**
     * Calculate success rate
     * @returns Success rate (percentage)
     */
    calculateSuccessRate(): number {
        const total = this.successCount + this.failureCount;
        if (total === 0) {
            return 0;
        }
        return (this.successCount / total) * 100;
    }

    /**
     * Calculate a percentile value using linear interpolation
     * @param sortedArray - Pre-sorted array of numbers
     * @param percentile - Percentile to calculate (0-100)
     * @returns Percentile value
     */
    private calculatePercentile(sortedArray: number[], percentile: number): number {
        if (sortedArray.length === 0) {
            return 0;
        }

        if (sortedArray.length === 1) {
            return sortedArray[0];
        }

        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (lower === upper) {
            return sortedArray[lower];
        }

        // Linear interpolation
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    /**
     * Round a number to the specified decimal places
     * @param value - The value to round
     * @param decimals - Number of decimal places
     * @returns Rounded value
     */
    private round(value: number | null | undefined, decimals: number): number {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * Convert to JSON format
     * @returns JSON object
     */
    toJSON(): TestMetricsJSON {
        return {
            testName: this.testName,
            threadCount: this.threadCount,
            totalIterations: this.totalIterations,
            startTime: this.startTime,
            endTime: this.endTime,
            successCount: this.successCount,
            failureCount: this.failureCount,
            metrics: {
                parallel: this.calculateParallelPerformanceMetrics(),
                latency: this.calculateLatencyMetrics(),
                throughput: this.calculateThroughputMetrics()
            },
            errors: this.errors
        };
    }

    /**
     * Get summary information
     * @returns Summary object
     */
    getSummary(): TestMetricsSummary {
        const metrics = this.calculateParallelPerformanceMetrics();

        return {
            testName: this.testName,
            threadCount: this.threadCount,
            qps: metrics.actualQPS,
            averageLatency: metrics.latency.average,
            p95Latency: metrics.latency.p95,
            successRate: this.round(this.calculateSuccessRate(), 2),
            parallelEfficiency: metrics.parallelEfficiency,
            totalDuration: metrics.totalDurationSeconds
        };
    }
}

export default TestMetrics;
