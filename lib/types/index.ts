/**
 * Type definitions for mysql-performance-tester
 *
 * These declarations provide IDE autocompletion and type checking
 * without converting the project to TypeScript.
 */

// ─── Configuration ──────────────────────────────────────────────────────

export interface DbConfigOptions {
    host?: string;
    port?: number | string;
    user?: string;
    password?: string;
    database?: string;
    connectTimeout?: number;
    acquireTimeout?: number;
    timeout?: number;
    parallelThreads?: number;
}

export interface DbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectTimeout: number;
    acquireTimeout: number;
    timeout: number;
    parallelThreads: number;
}

export interface PoolConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    waitForConnections: boolean;
    connectionLimit: number;
    queueLimit: number;
    maxIdle: number;
    idleTimeout: number;
    enableKeepAlive: boolean;
    keepAliveInitialDelay: number;
    connectTimeout: number;
    acquireTimeout: number;
    multipleStatements: boolean;
}

export interface FileManagerConfig {
    enableDebugOutput: boolean;
    outputDir: string;
    enableTimestamp: boolean;
    maxFileSize: number;
}

export interface TestConfigOptions {
    tableName?: string;
    testIterations?: number;
    parallelThreads?: number;
    skipParallelTests?: boolean;
    sqlDirectory?: string;
    parallelDirectory?: string;
    resultDirectory?: string;
    enableWarmup?: boolean;
    warmupIterations?: number | null;
    warmupPercentage?: number;
    enableStatistics?: boolean;
    removeOutliers?: boolean;
    outlierMethod?: string;
    enableOptimizerTrace?: boolean;
    enableExplainAnalyze?: boolean;
    generateReport?: boolean;
    enableBufferPoolMonitoring?: boolean;
    enablePerformanceSchema?: boolean;
    clearCacheBeforeEachTest?: boolean;
    enableDebugOutput?: boolean;
    debugOutputDir?: string;
    enableTimestamp?: boolean;
    maxFileSize?: number;
}

export interface TestConfig {
    tableName: string;
    testIterations: number;
    parallelThreads: number;
    skipParallelTests: boolean;
    sqlDirectory: string;
    parallelDirectory: string;
    resultDirectory: string;
    enableWarmup: boolean;
    warmupIterations: number | null;
    warmupPercentage: number;
    enableStatistics: boolean;
    removeOutliers: boolean;
    outlierMethod: 'iqr' | 'zscore' | 'mad';
    enableOptimizerTrace: boolean;
    enableExplainAnalyze: boolean;
    generateReport: boolean;
    enableBufferPoolMonitoring: boolean;
    enablePerformanceSchema: boolean;
    clearCacheBeforeEachTest: boolean;
    fileManager: FileManagerConfig;
}

export interface TestConfigValidation {
    valid: boolean;
    errors: string[];
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

// ─── Analyzer Results ──────────────────────────────────────────────────

export interface BufferPoolMetrics {
    hitRatio: number;
    reads: number;
    readRequests: number;
    pagesTotal: number;
    pagesFree: number;
    pagesData: number;
}

export interface BufferPoolAnalysisResult {
    rawData: Record<string, string>;
    metrics: BufferPoolMetrics;
    timestamp: string;
}

export interface ExplainQueryResult {
    type: 'EXPLAIN';
    data: Record<string, unknown>;
    timestamp: string;
}

export interface ExplainAnalyzeResult {
    type: 'EXPLAIN_ANALYZE';
    tree: string;
    json: Record<string, unknown> | null;
    timestamp: string;
}

export interface OptimizerTraceResult {
    trace: Record<string, unknown>;
    timestamp: string;
}

export interface TopQueryEntry {
    query: string;
    executionCount: number;
    avgLatency: number;
    maxLatency: number;
    rowsExamined: number;
    rowsSent: number;
}

export interface WaitEventEntry {
    eventName: string;
    count: number;
    totalWait: number;
}

export interface TableScanEntry {
    schema: string;
    table: string;
    fullScans: number;
}

export interface PerformanceSchemaMetrics {
    bufferPool: Record<string, number | string> | null;
    topQueries: TopQueryEntry[] | null;
    waitEvents: WaitEventEntry[] | null;
    tableScans: TableScanEntry[] | null;
    connections: Record<string, number> | null;
}

// ─── Query History ─────────────────────────────────────────────────────

export interface QueryHistoryEntry {
    testId: string;
    testName: string;
    timestamp: string;
    statistics: StatisticsResult;
    explainAccessType?: string;
}

export type QueryEventType =
    | 'index_added'
    | 'index_removed'
    | 'schema_change'
    | 'config_change'
    | 'custom';

export interface QueryEvent {
    id: string;
    queryFingerprint: string;
    label: string;
    type: QueryEventType;
    timestamp: string;
    createdAt: string;
}

export interface QueryFingerprintSummary {
    queryFingerprint: string;
    queryText: string;
    latestTestName: string;
    runCount: number;
    latestRunAt: string;
}

export interface QueryTimeline {
    queryFingerprint: string;
    queryText: string;
    entries: QueryHistoryEntry[];
    events: QueryEvent[];
}
