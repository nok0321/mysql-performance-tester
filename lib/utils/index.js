/**
 * Utils Module - ユーティリティ層の統合エクスポート
 *
 * すべてのユーティリティ機能を一箇所から参照できるようにする
 *
 * 使用例:
 *   import { Logger, round, validateQuery, handleError } from './utils/index.js';
 *
 * @module utils
 */

// Logger
export { Logger, LogLevel, defaultLogger, debug, info, warn, error, success, failure } from './logger.js';

// Formatter
export {
    round,
    formatDuration,
    formatPercentage,
    formatNumber,
    formatBytes,
    formatQPS,
    formatLatency,
    formatTimestamp,
    formatTable
} from './formatter.js';

// Validator
export {
    ValidationError,
    validateQuery,
    validateConfig,
    validatePercentile,
    validatePositiveInteger,
    validateString,
    validateDatabaseConfig,
    validateArray
} from './validator.js';

// Error Handler
export {
    PerformanceTestError,
    DatabaseConnectionError,
    QueryExecutionError,
    ConfigurationError,
    TimeoutError,
    FileSystemError,
    ErrorHandler,
    defaultErrorHandler,
    handleError,
    getErrorReport
} from './error-handler.js';

// デフォルトエクスポート（名前付きインポートを推奨）
export default {
    // Logger
    Logger,
    LogLevel,
    defaultLogger,

    // Formatter
    round,
    formatDuration,
    formatPercentage,
    formatNumber,
    formatBytes,
    formatQPS,
    formatLatency,
    formatTimestamp,
    formatTable,

    // Validator
    ValidationError,
    validateQuery,
    validateConfig,
    validatePercentile,
    validatePositiveInteger,
    validateString,
    validateDatabaseConfig,
    validateArray,

    // Error Handler
    PerformanceTestError,
    DatabaseConnectionError,
    QueryExecutionError,
    ConfigurationError,
    TimeoutError,
    FileSystemError,
    ErrorHandler,
    defaultErrorHandler,
    handleError,
    getErrorReport
};
