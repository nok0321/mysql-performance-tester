/**
 * ErrorHandler Utility - エラーハンドリングユーティリティ
 *
 * エラー処理の統一的な管理を提供
 *
 * 機能:
 * - カスタムエラークラス
 * - エラーロギング
 * - エラーレポート生成
 * - エラー分類とカテゴライゼーション
 *
 * @module utils/error-handler
 */

/**
 * ベースカスタムエラークラス
 */
export class PerformanceTestError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'PerformanceTestError';
        this.timestamp = new Date().toISOString();
        this.context = options.context || {};
        this.cause = options.cause || null;
        this.recoverable = options.recoverable !== false;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            timestamp: this.timestamp,
            context: this.context,
            cause: this.cause ? this.cause.message : null,
            recoverable: this.recoverable,
            stack: this.stack
        };
    }
}

/**
 * データベース接続エラー
 */
export class DatabaseConnectionError extends PerformanceTestError {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'DatabaseConnectionError';
        this.recoverable = options.recoverable !== undefined ? options.recoverable : true;
    }
}

/**
 * クエリ実行エラー
 */
export class QueryExecutionError extends PerformanceTestError {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'QueryExecutionError';
        this.query = options.query || null;
        this.sqlState = options.sqlState || null;
        this.errno = options.errno || null;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            query: this.query,
            sqlState: this.sqlState,
            errno: this.errno
        };
    }
}

/**
 * 設定エラー
 */
export class ConfigurationError extends PerformanceTestError {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'ConfigurationError';
        this.field = options.field || null;
        this.recoverable = false;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            field: this.field
        };
    }
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends PerformanceTestError {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'TimeoutError';
        this.timeout = options.timeout || null;
        this.operation = options.operation || null;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            timeout: this.timeout,
            operation: this.operation
        };
    }
}

/**
 * ファイルシステムエラー
 */
export class FileSystemError extends PerformanceTestError {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'FileSystemError';
        this.filePath = options.filePath || null;
        this.operation = options.operation || null;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            filePath: this.filePath,
            operation: this.operation
        };
    }
}

/**
 * エラーハンドラークラス
 */
export class ErrorHandler {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.errorLog = [];
        this.maxLogSize = options.maxLogSize || 1000;
    }

    /**
     * エラーをハンドル
     * @param {Error} error - エラーオブジェクト
     * @param {Object} [context] - コンテキスト情報
     * @returns {Object} エラー情報
     */
    handle(error, context = {}) {
        const errorInfo = this.analyzeError(error, context);
        this.logError(errorInfo);
        this.recordError(errorInfo);

        return errorInfo;
    }

    /**
     * エラーを分析
     * @param {Error} error - エラーオブジェクト
     * @param {Object} context - コンテキスト情報
     * @returns {Object} エラー情報
     */
    analyzeError(error, context = {}) {
        const errorInfo = {
            name: error.name || 'Error',
            message: error.message || 'Unknown error',
            type: this.categorizeError(error),
            severity: this.determineSeverity(error),
            timestamp: new Date().toISOString(),
            context,
            stack: error.stack,
            recoverable: error.recoverable !== undefined ? error.recoverable : true
        };

        // カスタムエラーの追加情報
        if (error instanceof QueryExecutionError) {
            errorInfo.query = error.query;
            errorInfo.sqlState = error.sqlState;
            errorInfo.errno = error.errno;
        } else if (error instanceof ConfigurationError) {
            errorInfo.field = error.field;
        } else if (error instanceof TimeoutError) {
            errorInfo.timeout = error.timeout;
            errorInfo.operation = error.operation;
        } else if (error instanceof FileSystemError) {
            errorInfo.filePath = error.filePath;
            errorInfo.operation = error.operation;
        }

        return errorInfo;
    }

    /**
     * エラーを分類
     * @param {Error} error - エラーオブジェクト
     * @returns {string} エラータイプ
     */
    categorizeError(error) {
        if (error instanceof DatabaseConnectionError) {
            return 'DATABASE_CONNECTION';
        } else if (error instanceof QueryExecutionError) {
            return 'QUERY_EXECUTION';
        } else if (error instanceof ConfigurationError) {
            return 'CONFIGURATION';
        } else if (error instanceof TimeoutError) {
            return 'TIMEOUT';
        } else if (error instanceof FileSystemError) {
            return 'FILESYSTEM';
        } else if (error.code === 'ECONNREFUSED') {
            return 'CONNECTION_REFUSED';
        } else if (error.code === 'ETIMEDOUT') {
            return 'TIMEOUT';
        } else if (error.code === 'ENOENT') {
            return 'FILE_NOT_FOUND';
        } else if (error.code === 'EACCES') {
            return 'PERMISSION_DENIED';
        } else {
            return 'UNKNOWN';
        }
    }

    /**
     * エラーの深刻度を判定
     * @param {Error} error - エラーオブジェクト
     * @returns {string} 深刻度（CRITICAL, HIGH, MEDIUM, LOW）
     */
    determineSeverity(error) {
        if (error.recoverable === false) {
            return 'CRITICAL';
        }

        if (error instanceof ConfigurationError) {
            return 'CRITICAL';
        }

        if (error instanceof DatabaseConnectionError) {
            return 'HIGH';
        }

        if (error instanceof QueryExecutionError) {
            // SQLエラーコードによる判定
            if (error.errno) {
                // デッドロック、ロックタイムアウトなど
                if ([1213, 1205].includes(error.errno)) {
                    return 'MEDIUM';
                }
                // 構文エラー、存在しないテーブルなど
                if ([1064, 1146].includes(error.errno)) {
                    return 'HIGH';
                }
            }
            return 'MEDIUM';
        }

        if (error instanceof TimeoutError) {
            return 'MEDIUM';
        }

        return 'LOW';
    }

    /**
     * エラーをログ出力
     * @param {Object} errorInfo - エラー情報
     */
    logError(errorInfo) {
        const logMessage = this.formatErrorLog(errorInfo);

        switch (errorInfo.severity) {
            case 'CRITICAL':
                this.logger.error('[CRITICAL]', logMessage);
                break;
            case 'HIGH':
                this.logger.error('[HIGH]', logMessage);
                break;
            case 'MEDIUM':
                this.logger.warn('[MEDIUM]', logMessage);
                break;
            case 'LOW':
                this.logger.info('[LOW]', logMessage);
                break;
            default:
                this.logger.log(logMessage);
        }
    }

    /**
     * エラーログをフォーマット
     * @param {Object} errorInfo - エラー情報
     * @returns {string} フォーマット済みログ
     */
    formatErrorLog(errorInfo) {
        const parts = [
            `[${errorInfo.type}]`,
            errorInfo.name + ':',
            errorInfo.message
        ];

        if (errorInfo.context && Object.keys(errorInfo.context).length > 0) {
            parts.push('\nContext:', JSON.stringify(errorInfo.context, null, 2));
        }

        return parts.join(' ');
    }

    /**
     * エラーを記録
     * @param {Object} errorInfo - エラー情報
     */
    recordError(errorInfo) {
        this.errorLog.push(errorInfo);

        // ログサイズ制限
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }
    }

    /**
     * エラーレポートを生成
     * @returns {Object} エラーレポート
     */
    generateReport() {
        const summary = this.generateSummary();
        const errorsByType = this.groupErrorsByType();
        const errorsBySeverity = this.groupErrorsBySeverity();
        const timeline = this.generateTimeline();

        return {
            summary,
            errorsByType,
            errorsBySeverity,
            timeline,
            totalErrors: this.errorLog.length,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * エラーサマリーを生成
     * @returns {Object} サマリー
     */
    generateSummary() {
        const totalErrors = this.errorLog.length;
        const criticalCount = this.errorLog.filter(e => e.severity === 'CRITICAL').length;
        const highCount = this.errorLog.filter(e => e.severity === 'HIGH').length;
        const mediumCount = this.errorLog.filter(e => e.severity === 'MEDIUM').length;
        const lowCount = this.errorLog.filter(e => e.severity === 'LOW').length;
        const recoverableCount = this.errorLog.filter(e => e.recoverable).length;

        return {
            totalErrors,
            criticalCount,
            highCount,
            mediumCount,
            lowCount,
            recoverableCount,
            nonRecoverableCount: totalErrors - recoverableCount
        };
    }

    /**
     * エラーをタイプごとにグループ化
     * @returns {Object} タイプ別エラー
     */
    groupErrorsByType() {
        const groups = {};

        this.errorLog.forEach(error => {
            const type = error.type || 'UNKNOWN';
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(error);
        });

        return Object.fromEntries(
            Object.entries(groups).map(([type, errors]) => [
                type,
                {
                    count: errors.length,
                    errors: errors.slice(0, 10) // 最大10件
                }
            ])
        );
    }

    /**
     * エラーを深刻度ごとにグループ化
     * @returns {Object} 深刻度別エラー
     */
    groupErrorsBySeverity() {
        const groups = {
            CRITICAL: [],
            HIGH: [],
            MEDIUM: [],
            LOW: []
        };

        this.errorLog.forEach(error => {
            const severity = error.severity || 'LOW';
            if (groups[severity]) {
                groups[severity].push(error);
            }
        });

        return Object.fromEntries(
            Object.entries(groups).map(([severity, errors]) => [
                severity,
                {
                    count: errors.length,
                    errors: errors.slice(0, 10) // 最大10件
                }
            ])
        );
    }

    /**
     * エラータイムラインを生成
     * @returns {Array} タイムライン
     */
    generateTimeline() {
        return this.errorLog
            .slice(-100) // 最新100件
            .map(error => ({
                timestamp: error.timestamp,
                type: error.type,
                severity: error.severity,
                message: error.message
            }));
    }

    /**
     * エラーログをクリア
     */
    clearLog() {
        this.errorLog = [];
    }

    /**
     * エラーログを取得
     * @param {Object} [options] - オプション
     * @param {string} [options.type] - エラータイプでフィルター
     * @param {string} [options.severity] - 深刻度でフィルター
     * @param {number} [options.limit] - 取得件数制限
     * @returns {Array} エラーログ
     */
    getErrors(options = {}) {
        const { type, severity, limit } = options;

        let filtered = [...this.errorLog];

        if (type) {
            filtered = filtered.filter(e => e.type === type);
        }

        if (severity) {
            filtered = filtered.filter(e => e.severity === severity);
        }

        if (limit) {
            filtered = filtered.slice(-limit);
        }

        return filtered;
    }
}

/**
 * デフォルトエラーハンドラーインスタンス
 */
export const defaultErrorHandler = new ErrorHandler();

/**
 * 便利関数のエクスポート
 */
export const handleError = (error, context) => defaultErrorHandler.handle(error, context);
export const getErrorReport = () => defaultErrorHandler.generateReport();

export default {
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
