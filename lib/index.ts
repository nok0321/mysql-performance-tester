/**
 * MySQL Performance Tester
 * Main entry point - integrates all modules
 *
 * This file provides the public API as a library
 */

// ========== Configuration modules ==========
// Primary API (recommended)
export { createDbConfig, buildPoolConfig }          from './config/database-configuration.js';
export { createTestConfig, getWarmupIterations, validateTestConfig } from './config/test-configuration.js';
// Backward-compatible API (deprecated)
export { TestConfiguration }     from './config/test-configuration.js';

// ========== Core modules ==========
export { DatabaseConnection } from './core/database-connection.js';
export { QueryExecutor } from './core/query-executor.js';

// ========== Models ==========
export { TestResult } from './models/test-result.js';
export { TestMetrics } from './models/test-metrics.js';
export { AnalysisReport } from './models/analysis-report.js';

// ========== Tester modules ==========
export { MySQLPerformanceTester } from './testers/single-tester.js';
export { ParallelPerformanceTester } from './testers/parallel-tester.js';
export { MainTestRunner } from './main.js';

// ========== Analyzer modules ==========
export { BaseAnalyzer } from './analyzers/base-analyzer.js';
export { ExplainAnalyzer } from './analyzers/explain-analyzer.js';
export { OptimizerTraceAnalyzer } from './analyzers/optimizer-trace-analyzer.js';
export { PerformanceSchemaAnalyzer } from './analyzers/performance-schema-analyzer.js';
export { BufferPoolMonitor } from './analyzers/buffer-pool-monitor.js';

// ========== Statistics modules ==========
export { StatisticsCalculator } from './statistics/statistics-calculator.js';
export { OutlierDetector } from './statistics/outlier-detector.js';
export { DistributionAnalyzer } from './statistics/distribution-analyzer.js';

// ========== Warmup modules ==========
export { WarmupManager } from './warmup/warmup-manager.js';
export { CacheEffectivenessAnalyzer } from './warmup/cache-effectiveness-analyzer.js';

// ========== Parallel execution modules ==========
export { SQLFileManager } from './parallel/sql-file-manager.js';
export { ParallelExecutor } from './parallel/parallel-executor.js';
export {
    RandomDistributionStrategy,
    RoundRobinDistributionStrategy,
    SequentialDistributionStrategy,
    CategoryBasedDistributionStrategy,
    StrategyFactory
} from './parallel/distribution-strategy.js';

// ========== Storage modules ==========
export { FileManager } from './storage/file-manager.js';
export { ResultStorage } from './storage/result-storage.js';

// ========== Report modules ==========
export { ReportGenerator } from './reports/report-generator.js';
export { ReportAnalyzer } from './reports/report-analyzer.js';
export { RecommendationEngine } from './reports/recommendation-engine.js';
export { BaseExporter } from './reports/exporters/base-exporter.js';
export { JsonExporter } from './reports/exporters/json-exporter.js';
export { MarkdownExporter } from './reports/exporters/markdown-exporter.js';
export { HtmlExporter } from './reports/exporters/html-exporter.js';
export { CsvExporter } from './reports/exporters/csv-exporter.js';
export { ExcelExporter } from './reports/exporters/excel-exporter.js';

// ========== Utility modules ==========
export { Logger } from './utils/logger.js';
export * as Formatter from './utils/formatter.js';
export * as Validator from './utils/validator.js';
export { ErrorHandler } from './utils/error-handler.js';
