/**
 * Models Module - Unified export for the data model layer
 *
 * Allows all model classes to be imported from a single location
 *
 * Usage:
 *   import { TestResult, TestMetrics, AnalysisReport } from './models/index.js';
 *
 * @module models
 */

export { TestResult } from './test-result.js';
export { TestMetrics } from './test-metrics.js';
export { AnalysisReport } from './analysis-report.js';

// Re-export key interfaces for convenience
export type { ExecutionResult, TestResultSummary, ErrorInfo } from './test-result.js';
export type { LatencyMetrics, ThroughputMetrics, ParallelPerformanceMetrics } from './test-metrics.js';
export type { ReportSummary, ReportRecommendation } from './analysis-report.js';
