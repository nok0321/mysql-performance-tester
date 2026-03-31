/**
 * TestResult Model - Test result data model
 *
 * Manages the result of a single test
 *
 * Features:
 * - Accumulation of execution results
 * - Statistics calculation (via StatisticsCalculator)
 * - Storage of various analysis results
 * - Export to JSON format
 *
 * @module models/test-result
 */

import { StatisticsCalculator } from '../statistics/statistics-calculator.js';
import type {
    StatisticsResult,
    BufferPoolAnalysisResult,
    OptimizerTraceResult,
    ExplainAnalyzeResult,
    ExplainQueryResult,
    PerformanceSchemaMetrics,
} from '../types/index.js';
import type { WarmupSummary } from '../warmup/warmup-manager.js';

/** Single iteration execution result */
export interface ExecutionResult {
    readonly success: boolean;
    readonly duration: number;
    readonly rowCount?: number;
    readonly error?: string;
    readonly timestamp: string;
}

/** Configuration for statistics calculation */
interface StatisticsConfig {
    removeOutliers?: boolean;
    outlierMethod?: string;
}

/** Simple statistics summary */
interface SimpleStatistics {
    success: number;
    failure: number;
    total: number;
    average: number;
    min: number;
    max: number;
    stdDev: number;
}

/** Summary of a test result */
export interface TestResultSummary {
    testName: string;
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    hasStatistics: boolean;
    hasWarmup: boolean;
    hasAnalysis: {
        bufferPool: boolean;
        optimizerTrace: boolean;
        explainAnalyze: boolean;
        performanceSchema: boolean;
    };
}

/** Error information from a failed execution */
export interface ErrorInfo {
    error: string;
    timestamp: string;
    duration: number;
}

/** JSON representation of a TestResult */
interface TestResultJSON {
    testName: string;
    query: string;
    timestamp: string;
    warmup: WarmupSummary | null;
    statistics: StatisticsResult | null;
    simpleStatistics: SimpleStatistics | null;
    bufferPool: BufferPoolAnalysisResult | null;
    optimizerTrace: OptimizerTraceResult | null;
    explainAnalyze: ExplainAnalyzeResult | ExplainQueryResult | null;
    performanceSchema: PerformanceSchemaMetrics | null;
    parallelResults: Record<string, unknown> | null;
    rawResults: ExecutionResult[];
}

/**
 * Test result class
 */
export class TestResult {
    public readonly testName: string;
    public readonly query: string;
    public rawDurations: number[];
    public results: ExecutionResult[];
    public statistics: StatisticsResult | null;
    public warmupResult: WarmupSummary | null;
    public bufferPoolAnalysis: BufferPoolAnalysisResult | null;
    public optimizerTrace: OptimizerTraceResult | null;
    public explainAnalyze: ExplainAnalyzeResult | ExplainQueryResult | null;
    public performanceSchemaMetrics: PerformanceSchemaMetrics | null;
    public parallelResults: Record<string, unknown> | null;
    public readonly timestamp: string;

    /**
     * Initialize test result
     * @param testName - Test name
     * @param query - Executed SQL query
     */
    constructor(testName: string, query: string) {
        this.testName = testName;
        this.query = query;
        this.rawDurations = [];
        this.results = [];
        this.statistics = null;
        this.warmupResult = null;
        this.bufferPoolAnalysis = null;
        this.optimizerTrace = null;
        this.explainAnalyze = null;
        this.performanceSchemaMetrics = null;
        this.parallelResults = null;
        this.timestamp = new Date().toISOString();
    }

    /**
     * Add an execution result
     * @param result - Execution result
     */
    addResult(result: ExecutionResult): void {
        this.results.push(result);
        if (result.success && result.duration) {
            this.rawDurations.push(result.duration);
        }
    }

    /**
     * Calculate statistics using StatisticsCalculator
     *
     * @param config - Test configuration object
     * @returns Statistics result or null
     */
    calculateStatistics(config: StatisticsConfig): StatisticsResult | null {
        if (this.rawDurations.length === 0) {
            return null;
        }

        const options = {
            removeOutliers: config.removeOutliers !== undefined ? config.removeOutliers : true,
            outlierMethod: (config.outlierMethod || 'iqr') as 'iqr' | 'zscore' | 'mad',
            includeDistribution: true
        };

        this.statistics = StatisticsCalculator.calculate(this.rawDurations, options);
        return this.statistics;
    }

    /**
     * Calculate simple statistics summary
     *
     * @returns Simple statistics or null
     */
    calculateSimpleStatistics(): SimpleStatistics | null {
        const successResults = this.results.filter(r => r.success);
        if (successResults.length === 0) {
            return null;
        }

        const durations = successResults.map(r => r.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const stdDev = Math.sqrt(
            durations.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / durations.length
        );

        return {
            success: successResults.length,
            failure: this.results.length - successResults.length,
            total: this.results.length,
            average: this.round(avg, 3),
            min: this.round(min, 3),
            max: this.round(max, 3),
            stdDev: this.round(stdDev, 3)
        };
    }

    /**
     * Round a number to a specified number of decimal places
     *
     * @param value - The value to round
     * @param decimals - Number of decimal places
     * @returns Rounded value
     */
    private round(value: number, decimals: number): number {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * Export to JSON format
     *
     * @returns JSON representation
     */
    toJSON(): TestResultJSON {
        return {
            testName: this.testName,
            query: this.query,
            timestamp: this.timestamp,
            warmup: this.warmupResult,
            statistics: this.statistics,
            simpleStatistics: this.calculateSimpleStatistics(),
            bufferPool: this.bufferPoolAnalysis,
            optimizerTrace: this.optimizerTrace,
            explainAnalyze: this.explainAnalyze,
            performanceSchema: this.performanceSchemaMetrics,
            parallelResults: this.parallelResults,
            rawResults: this.results
        };
    }

    /**
     * Get summary information
     * @returns Summary
     */
    getSummary(): TestResultSummary {
        const successCount = this.results.filter(r => r.success).length;
        const failureCount = this.results.length - successCount;
        const successRate = this.results.length > 0
            ? (successCount / this.results.length) * 100
            : 0;

        return {
            testName: this.testName,
            totalExecutions: this.results.length,
            successCount,
            failureCount,
            successRate: this.round(successRate, 2),
            hasStatistics: this.statistics !== null,
            hasWarmup: this.warmupResult !== null,
            hasAnalysis: {
                bufferPool: this.bufferPoolAnalysis !== null,
                optimizerTrace: this.optimizerTrace !== null,
                explainAnalyze: this.explainAnalyze !== null,
                performanceSchema: this.performanceSchemaMetrics !== null
            }
        };
    }

    /**
     * Get error information from failed executions
     * @returns Array of error information
     */
    getErrors(): ErrorInfo[] {
        return this.results
            .filter(r => !r.success && r.error)
            .map(r => ({
                error: r.error!,
                timestamp: r.timestamp,
                duration: r.duration
            }));
    }

    /**
     * Calculate success rate
     * @returns Success rate (percentage)
     */
    getSuccessRate(): number {
        if (this.results.length === 0) return 0;
        const successCount = this.results.filter(r => r.success).length;
        return this.round((successCount / this.results.length) * 100, 2);
    }

    /**
     * Get total execution duration
     * @returns Total duration (milliseconds)
     */
    getTotalDuration(): number {
        return this.rawDurations.reduce((sum, duration) => sum + duration, 0);
    }
}

export default TestResult;
