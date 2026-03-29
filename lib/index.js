/**
 * MySQL Performance Tester
 * メインエントリーポイント - すべてのモジュールを統合
 *
 * このファイルはライブラリとしての公開APIを提供します
 */

// ========== 設定モジュール ==========
// プライマリ API（推奨）
export { createDbConfig, buildPoolConfig }          from './config/database-configuration.js';
export { createTestConfig, getWarmupIterations, validateTestConfig } from './config/test-configuration.js';
// 後方互換 API（非推奨）
export { DatabaseConfiguration } from './config/database-configuration.js';
export { TestConfiguration }     from './config/test-configuration.js';

// ========== コアモジュール ==========
export { DatabaseConnection } from './core/database-connection.js';
export { QueryExecutor } from './core/query-executor.js';

// ========== モデル ==========
export { TestResult } from './models/test-result.js';
export { TestMetrics } from './models/test-metrics.js';
export { AnalysisReport } from './models/analysis-report.js';

// ========== テスターモジュール ==========
export { MySQLPerformanceTester } from './testers/single-tester.js';
export { ParallelPerformanceTester } from './testers/parallel-tester.js';
export { MainTestRunner } from './main.js';

// ========== アナライザーモジュール ==========
export { BaseAnalyzer } from './analyzers/base-analyzer.js';
export { ExplainAnalyzer } from './analyzers/explain-analyzer.js';
export { OptimizerTraceAnalyzer } from './analyzers/optimizer-trace-analyzer.js';
export { PerformanceSchemaAnalyzer } from './analyzers/performance-schema-analyzer.js';
export { BufferPoolMonitor } from './analyzers/buffer-pool-monitor.js';

// ========== 統計モジュール ==========
export { StatisticsCalculator } from './statistics/statistics-calculator.js';
export { OutlierDetector } from './statistics/outlier-detector.js';
export { DistributionAnalyzer } from './statistics/distribution-analyzer.js';

// ========== ウォームアップモジュール ==========
export { WarmupManager } from './warmup/warmup-manager.js';
export { CacheEffectivenessAnalyzer } from './warmup/cache-effectiveness-analyzer.js';

// ========== 並列実行モジュール ==========
export { SQLFileManager } from './parallel/sql-file-manager.js';
export { ParallelExecutor } from './parallel/parallel-executor.js';
export {
    RandomDistributionStrategy,
    RoundRobinDistributionStrategy,
    SequentialDistributionStrategy,
    CategoryBasedDistributionStrategy,
    StrategyFactory
} from './parallel/distribution-strategy.js';

// ========== ストレージモジュール ==========
export { FileManager } from './storage/file-manager.js';
export { ResultStorage } from './storage/result-storage.js';

// ========== レポートモジュール ==========
export { ReportGenerator } from './reports/report-generator.js';
export { ReportAnalyzer } from './reports/report-analyzer.js';
export { RecommendationEngine } from './reports/recommendation-engine.js';
export { BaseExporter } from './reports/exporters/base-exporter.js';
export { JsonExporter } from './reports/exporters/json-exporter.js';
export { MarkdownExporter } from './reports/exporters/markdown-exporter.js';
export { HtmlExporter } from './reports/exporters/html-exporter.js';
export { CsvExporter } from './reports/exporters/csv-exporter.js';
export { ExcelExporter } from './reports/exporters/excel-exporter.js';

// ========== ユーティリティモジュール ==========
export { Logger } from './utils/logger.js';
export * as Formatter from './utils/formatter.js';
export * as Validator from './utils/validator.js';
export { ErrorHandler } from './utils/error-handler.js';

