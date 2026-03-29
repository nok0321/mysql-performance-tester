/**
 * Type definitions for mysql-performance-tester
 *
 * These declarations provide IDE autocompletion and type checking
 * without converting the project to TypeScript.
 */

// ─── Configuration ──────────────────────────────────────────────────────

export interface DbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit?: number;
    connectTimeout?: number;
    acquireTimeout?: number;
    parallelThreads?: number;
}

export interface TestConfig {
    testIterations: number;
    parallelThreads: number;
    enableWarmup: boolean;
    warmupPercentage: number;
    removeOutliers: boolean;
    outlierMethod: 'iqr' | 'zscore' | 'mad';
    enableExplainAnalyze: boolean;
    enableOptimizerTrace: boolean;
    enableBufferPoolMonitoring: boolean;
    enablePerformanceSchema: boolean;
    sqlDirectory: string;
    parallelDirectory: string;
    generateReport: boolean;
    enableDebugOutput: boolean;
    resultDirectory: string;
}

// ─── Statistics ──────────────────────────────────────────────────────────

export interface Percentiles {
    p01: number;
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    p999: number;
}

export interface BasicStats {
    min: number;
    max: number;
    mean: number;
    median: number;
    sum: number;
}

export interface SpreadStats {
    range: number;
    variance: number;
    stdDev: number;
    cv: number;
    iqr: number;
}

export interface OutlierInfo {
    count: number;
    percentage: number;
    values: number[];
    method: 'iqr' | 'zscore' | 'mad';
}

export interface DistributionBin {
    start: number;
    end: number;
    count: number;
    percentage: number;
}

export interface Distribution {
    bins: DistributionBin[];
    binCount: number;
    binWidth: number;
}

export interface StatisticsResult {
    count: {
        total: number;
        included: number;
        outliers: number;
    };
    basic: BasicStats;
    spread: SpreadStats;
    percentiles: Percentiles;
    outliers: OutlierInfo | null;
    distribution?: Distribution;
}

// ─── Test Results ───────────────────────────────────────────────────────

export interface TestResult {
    testName: string;
    query: string;
    durations: number[];
    statistics: StatisticsResult;
    explainAnalyze?: ExplainResult;
    bufferPoolAnalysis?: object;
    performanceSchemaAnalysis?: object;
    warmupAnalysis?: WarmupAnalysis;
}

export interface ExplainResult {
    data: object | null;
    analyze?: {
        tree: string;
    };
    queryPlan?: {
        issues: string[];
        recommendations: string[];
    };
}

export interface WarmupAnalysis {
    warmupIterations: number;
    improvementPercentage: number;
    isEffective: boolean;
    recommendations: string[];
}

// ─── Parallel Test ──────────────────────────────────────────────────────

export interface ParallelMetrics {
    throughput: {
        qps: number;
        tps: number;
    };
    queries: {
        total: number;
        successful: number;
        failed: number;
        successRate: string;
    };
    latency: {
        mean: number;
        percentiles: Percentiles;
    };
    duration: {
        milliseconds: number;
        seconds: number;
    };
    perFile?: Record<string, FileMetrics>;
}

export interface FileMetrics {
    completed: number;
    failed: number;
    successRate: string;
    latency: {
        mean: number;
        min: number;
        max: number;
        p50: number;
        p95: number;
        p99: number;
    };
}

// ─── Reports ────────────────────────────────────────────────────────────

export interface ReportData {
    summary?: {
        totalTests: number;
        totalDuration: number;
    };
    config?: Partial<TestConfig>;
    testResults?: TestResult[];
    recommendations?: Recommendation[];
    generatedAt?: string;
}

export interface Recommendation {
    category: string;
    priority: 'High' | 'Medium' | 'Low';
    message: string;
}

export type PerformanceGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

// ─── Analysis Report ────────────────────────────────────────────────────

export interface AnalysisReportData {
    testResults: TestResult[];
    summary: object;
    performanceAnalysis: object;
    bufferPoolAnalysis: object;
    queryAnalysis: object;
    errorAnalysis: object;
    recommendations: Recommendation[];
}
