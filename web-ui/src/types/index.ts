/**
 * Shared type definitions for the MySQL Performance Tester web UI
 */

// ─── Connection ───────────────────────────────────────────────────────────

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolSize: number;
}

export interface ConnectionFormData {
  name: string;
  host: string;
  port: number | string;
  database: string;
  user: string;
  password: string;
  poolSize: number | string;
}

export interface ConnectionTestResult {
  loading?: boolean;
  ok?: boolean;
  error?: string;
  serverVersion?: string;
  supportsExplainAnalyze?: boolean;
}

// ─── SQL Library ──────────────────────────────────────────────────────────

export interface SqlItem {
  id: string;
  name: string;
  sql: string;
  category: string;
  description: string;
  updatedAt: string;
  createdAt: string;
}

export interface SqlFormData {
  name: string;
  sql: string;
  category: string;
  description: string;
}

export interface SqlFilters {
  category?: string;
  keyword?: string;
}

// ─── Test Execution ───────────────────────────────────────────────────────

export interface TestProgress {
  phase?: string;
  current: number;
  total: number;
  duration: number | null;
}

export interface LiveDataPoint {
  t: number;
  duration: number | null;
}

export interface Percentiles {
  p01?: number;
  p05?: number;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  p95?: number;
  p99?: number;
  p999?: number;
  [key: string]: number | undefined;
}

export interface BasicStats {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
}

export interface SpreadStats {
  stdDev?: number;
  iqr?: number;
  cv?: number;
}

export interface CountStats {
  total?: number;
  included?: number;
  outliers?: number;
}

export interface DistributionBucket {
  min?: number;
  max?: number;
  count: number;
}

export interface Distribution {
  buckets?: DistributionBucket[];
}

export interface Statistics {
  basic?: BasicStats;
  percentiles?: Percentiles;
  spread?: SpreadStats;
  count?: CountStats;
  distribution?: Distribution;
}

export interface ExplainAnalyze {
  data?: unknown;
  analyze?: {
    tree?: string;
  };
  queryPlan?: QueryPlan;
}

export interface QueryPlan {
  issues?: string[];
  recommendations?: string[];
}

export interface SingleTestResult {
  statistics?: Statistics;
  explainAnalyze?: ExplainAnalyze;
}

// ─── Parallel Test ────────────────────────────────────────────────────────

export interface FileLatency {
  mean?: number;
  p50?: number;
  p95?: number;
  p99?: number;
  min?: number;
  max?: number;
}

export interface FileStats {
  completed?: number;
  failed?: number;
  successRate?: string;
  latency?: FileLatency;
}

export interface ParallelQueries {
  total?: number;
  successRate?: string;
}

export interface ParallelThroughput {
  qps?: number;
}

export interface ParallelDuration {
  seconds?: number;
}

export interface ParallelLatency {
  percentiles?: Percentiles;
}

export interface ParallelMetrics {
  queries?: ParallelQueries;
  throughput?: ParallelThroughput;
  duration?: ParallelDuration;
  latency?: ParallelLatency;
  perFile?: Record<string, FileStats>;
}

export interface ParallelStrategyResult {
  metrics?: ParallelMetrics;
}

export type ParallelResults = Record<string, ParallelStrategyResult>;

// ─── Run State (useTestExecution) ─────────────────────────────────────────

export type RunStateType = 'running' | 'complete' | 'error' | null;

export interface RunState {
  runState: RunStateType;
  progress: TestProgress;
  liveData: LiveDataPoint[];
  result: SingleTestResult | null;
  results: ParallelResults | null;
  comparison: ComparisonResult | null;
  errorMsg: string;
}

export type RunAction =
  | { type: 'start'; progress: TestProgress }
  | { type: 'progress'; data: TestProgress }
  | { type: 'complete'; data: { result?: SingleTestResult; results?: ParallelResults; comparison?: ComparisonResult } }
  | { type: 'error'; data: { message: string } };

// ─── WebSocket ────────────────────────────────────────────────────────────

export interface WsMessage {
  type: string;
  testId?: string;
  data?: TestProgress;
  [key: string]: unknown;
}

// ─── Reports ──────────────────────────────────────────────────────────────

export interface ReportSummary {
  id: string;
  type: string;
  testName?: string;
  createdAt: string;
}

export interface ReportDetail {
  testName?: string;
  result?: SingleTestResult;
  results?: ParallelResults | SingleTestResult[];
}

// ─── Single Test Form ─────────────────────────────────────────────────────

export interface SingleTestForm {
  connectionId: string;
  sqlMode: 'library' | 'direct';
  sqlId: string;
  sqlText: string;
  testName: string;
  testIterations: number;
  enableWarmup: boolean;
  warmupPercentage: number;
  removeOutliers: boolean;
  outlierMethod: string;
  enableExplainAnalyze: boolean;
  enableOptimizerTrace: boolean;
  enableBufferPoolMonitoring: boolean;
  enablePerformanceSchema: boolean;
  [key: string]: string | number | boolean;
}

// ─── Parallel Test Form ───────────────────────────────────────────────────

export interface ParallelTestForm {
  connectionId: string;
  testName: string;
  parallelThreads: number;
  testIterations: number;
  parallelDirectory: string;
  [key: string]: string | number;
}

// ─── Settings ─────────────────────────────────────────────────────────────

export interface SettingsForm {
  testIterations: number;
  warmupPercentage: number;
  outlierMethod: string;
  enableWarmup: boolean;
  removeOutliers: boolean;
  enableExplainAnalyze: boolean;
  enableOptimizerTrace: boolean;
  enableBufferPoolMonitoring: boolean;
  enablePerformanceSchema: boolean;
  debugOutputEnabled: boolean;
  autoSaveResults: boolean;
  [key: string]: string | number | boolean;
}

// ─── Comparison Test ─────────────────────────────────────────────────────

export interface ComparisonDelta {
  meanDiff: number;
  meanDiffPercent: number;
  medianDiff: number;
  medianDiffPercent: number;
  p50Diff: number;
  p50DiffPercent: number;
  p95Diff: number;
  p95DiffPercent: number;
  p99Diff: number;
  p99DiffPercent: number;
  winner: 'A' | 'B' | 'tie';
  summary: string;
}

export interface ComparisonResult {
  resultA: SingleTestResult;
  resultB: SingleTestResult;
  delta: ComparisonDelta | null;
  executionMode: 'sequential' | 'parallel';
  testNameA: string;
  testNameB: string;
}

export interface ComparisonTestForm {
  connectionId: string;
  executionMode: 'sequential' | 'parallel';
  sqlModeA: 'library' | 'direct';
  sqlIdA: string;
  sqlTextA: string;
  testNameA: string;
  sqlModeB: 'library' | 'direct';
  sqlIdB: string;
  sqlTextB: string;
  testNameB: string;
  testIterations: number;
  enableWarmup: boolean;
  warmupPercentage: number;
  removeOutliers: boolean;
  outlierMethod: string;
  enableExplainAnalyze: boolean;
  enableOptimizerTrace: boolean;
  enableBufferPoolMonitoring: boolean;
  enablePerformanceSchema: boolean;
  [key: string]: string | number | boolean;
}

// ─── Stat Card ────────────────────────────────────────────────────────────

export interface StatCardItem {
  label: string;
  value: number | string | null | undefined;
  unit: string;
  highlight?: boolean;
}

// ─── Query History ──────────────────────────────────────────────────────

export type QueryEventType =
  | 'index_added'
  | 'index_removed'
  | 'schema_change'
  | 'config_change'
  | 'custom';

export interface QueryFingerprintSummary {
  queryFingerprint: string;
  queryText: string;
  latestTestName: string;
  runCount: number;
  latestRunAt: string;
}

export interface QueryHistoryEntry {
  testId: string;
  testName: string;
  timestamp: string;
  statistics: Statistics;
  explainAccessType?: string;
}

export interface QueryEvent {
  id: string;
  queryFingerprint: string;
  label: string;
  type: QueryEventType;
  timestamp: string;
  createdAt: string;
}

export interface QueryTimeline {
  queryFingerprint: string;
  queryText: string;
  entries: QueryHistoryEntry[];
  events: QueryEvent[];
}

export interface HistoryComparison {
  before: Statistics;
  after: Statistics;
  delta: ComparisonDelta;
}

export interface CreateEventInput {
  queryFingerprint: string;
  label: string;
  type: QueryEventType;
  timestamp?: string;
}
