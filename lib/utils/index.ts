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
import {
    Logger as _Logger,
    LogLevel as _LogLevel,
    defaultLogger as _defaultLogger,
    debug as _debug,
    info as _info,
    warn as _warn,
    error as _error,
    success as _success,
    failure as _failure
} from './logger.js';
export { _Logger as Logger, _LogLevel as LogLevel, _defaultLogger as defaultLogger, _debug as debug, _info as info, _warn as warn, _error as error, _success as success, _failure as failure };
export type { LogLevelValue } from './logger.js';

// Formatter
import {
    round as _round,
    formatDuration as _formatDuration,
    formatPercentage as _formatPercentage,
    formatNumber as _formatNumber,
    formatBytes as _formatBytes,
    formatQPS as _formatQPS,
    formatLatency as _formatLatency,
    formatTimestamp as _formatTimestamp,
    formatTable as _formatTable,
    generateTestName as _generateTestName
} from './formatter.js';
export {
    _round as round,
    _formatDuration as formatDuration,
    _formatPercentage as formatPercentage,
    _formatNumber as formatNumber,
    _formatBytes as formatBytes,
    _formatQPS as formatQPS,
    _formatLatency as formatLatency,
    _formatTimestamp as formatTimestamp,
    _formatTable as formatTable,
    _generateTestName as generateTestName
};

// Validator
import {
    ValidationError as _ValidationError,
    validateQuery as _validateQuery,
    validateConfig as _validateConfig,
    validatePercentile as _validatePercentile,
    validatePositiveInteger as _validatePositiveInteger,
    validateString as _validateString,
    validateDatabaseConfig as _validateDatabaseConfig,
    validateArray as _validateArray
} from './validator.js';
export {
    _ValidationError as ValidationError,
    _validateQuery as validateQuery,
    _validateConfig as validateConfig,
    _validatePercentile as validatePercentile,
    _validatePositiveInteger as validatePositiveInteger,
    _validateString as validateString,
    _validateDatabaseConfig as validateDatabaseConfig,
    _validateArray as validateArray
};

// Error Handler
import {
    PerformanceTestError as _PerformanceTestError,
    DatabaseConnectionError as _DatabaseConnectionError,
    QueryExecutionError as _QueryExecutionError,
    ConfigurationError as _ConfigurationError,
    TimeoutError as _TimeoutError,
    FileSystemError as _FileSystemError,
    ErrorHandler as _ErrorHandler,
    defaultErrorHandler as _defaultErrorHandler,
    handleError as _handleError,
    getErrorReport as _getErrorReport
} from './error-handler.js';
export {
    _PerformanceTestError as PerformanceTestError,
    _DatabaseConnectionError as DatabaseConnectionError,
    _QueryExecutionError as QueryExecutionError,
    _ConfigurationError as ConfigurationError,
    _TimeoutError as TimeoutError,
    _FileSystemError as FileSystemError,
    _ErrorHandler as ErrorHandler,
    _defaultErrorHandler as defaultErrorHandler,
    _handleError as handleError,
    _getErrorReport as getErrorReport
};

// デフォルトエクスポート（名前付きインポートを推奨）
export default {
    // Logger
    Logger: _Logger,
    LogLevel: _LogLevel,
    defaultLogger: _defaultLogger,

    // Formatter
    round: _round,
    formatDuration: _formatDuration,
    formatPercentage: _formatPercentage,
    formatNumber: _formatNumber,
    formatBytes: _formatBytes,
    formatQPS: _formatQPS,
    formatLatency: _formatLatency,
    formatTimestamp: _formatTimestamp,
    formatTable: _formatTable,
    generateTestName: _generateTestName,

    // Validator
    ValidationError: _ValidationError,
    validateQuery: _validateQuery,
    validateConfig: _validateConfig,
    validatePercentile: _validatePercentile,
    validatePositiveInteger: _validatePositiveInteger,
    validateString: _validateString,
    validateDatabaseConfig: _validateDatabaseConfig,
    validateArray: _validateArray,

    // Error Handler
    PerformanceTestError: _PerformanceTestError,
    DatabaseConnectionError: _DatabaseConnectionError,
    QueryExecutionError: _QueryExecutionError,
    ConfigurationError: _ConfigurationError,
    TimeoutError: _TimeoutError,
    FileSystemError: _FileSystemError,
    ErrorHandler: _ErrorHandler,
    defaultErrorHandler: _defaultErrorHandler,
    handleError: _handleError,
    getErrorReport: _getErrorReport
};
