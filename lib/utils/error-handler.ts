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
 * PerformanceTestErrorオプション
 */
interface PerformanceTestErrorOptions {
    context?: Record<string, unknown>;
    cause?: Error | null;
    recoverable?: boolean;
}

/**
 * ベースカスタムエラークラス
 */
export class PerformanceTestError extends Error {
    timestamp: string;
    context: Record<string, unknown>;
    override cause: Error | null;
    recoverable: boolean;

    constructor(message: string, options: PerformanceTestErrorOptions = {}) {
        super(message);
        this.name = 'PerformanceTestError';
        this.timestamp = new Date().toISOString();
        this.context = options.context || {};
        this.cause = options.cause || null;
        this.recoverable = options.recoverable !== false;
    }

    toJSON(): Record<string, unknown> {
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
 * DatabaseConnectionErrorオプション
 */
interface DatabaseConnectionErrorOptions extends PerformanceTestErrorOptions {
    recoverable?: boolean;
}

/**
 * データベース接続エラー
 */
export class DatabaseConnectionError extends PerformanceTestError {
    constructor(message: string, options: DatabaseConnectionErrorOptions = {}) {
        super(message, options);
        this.name = 'DatabaseConnectionError';
        this.recoverable = options.recoverable !== undefined ? options.recoverable : true;
    }
}

/**
 * QueryExecutionErrorオプション
 */
interface QueryExecutionErrorOptions extends PerformanceTestErrorOptions {
    query?: string | null;
    sqlState?: string | null;
    errno?: number | null;
}

/**
 * クエリ実行エラー
 */
export class QueryExecutionError extends PerformanceTestError {
    query: string | null;
    sqlState: string | null;
    errno: number | null;

    constructor(message: string, options: QueryExecutionErrorOptions = {}) {
        super(message, options);
        this.name = 'QueryExecutionError';
        this.query = options.query || null;
        this.sqlState = options.sqlState || null;
        this.errno = options.errno || null;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            query: this.query,
            sqlState: this.sqlState,
            errno: this.errno
        };
    }
}

/**
 * ConfigurationErrorオプション
 */
interface ConfigurationErrorOptions extends PerformanceTestErrorOptions {
    field?: string | null;
}

/**
 * 設定エラー
 */
export class ConfigurationError extends PerformanceTestError {
    field: string | null;

    constructor(message: string, options: ConfigurationErrorOptions = {}) {
        super(message, options);
        this.name = 'ConfigurationError';
        this.field = options.field || null;
        this.recoverable = false;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            field: this.field
        };
    }
}

/**
 * TimeoutErrorオプション
 */
interface TimeoutErrorOptions extends PerformanceTestErrorOptions {
    timeout?: number | null;
    operation?: string | null;
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends PerformanceTestError {
    timeout: number | null;
    operation: string | null;

    constructor(message: string, options: TimeoutErrorOptions = {}) {
        super(message, options);
        this.name = 'TimeoutError';
        this.timeout = options.timeout || null;
        this.operation = options.operation || null;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            timeout: this.timeout,
            operation: this.operation
        };
    }
}

/**
 * FileSystemErrorオプション
 */
interface FileSystemErrorOptions extends PerformanceTestErrorOptions {
    filePath?: string | null;
    operation?: string | null;
}

/**
 * ファイルシステムエラー
 */
export class FileSystemError extends PerformanceTestError {
    filePath: string | null;
    operation: string | null;

    constructor(message: string, options: FileSystemErrorOptions = {}) {
        super(message, options);
        this.name = 'FileSystemError';
        this.filePath = options.filePath || null;
        this.operation = options.operation || null;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            filePath: this.filePath,
            operation: this.operation
        };
    }
}

/**
 * エラー情報の型定義
 */
interface ErrorInfo {
    name: string;
    message: string;
    type: string;
    severity: string;
    timestamp: string;
    context: Record<string, unknown>;
    stack: string | undefined;
    recoverable: boolean;
    query?: string | null;
    sqlState?: string | null;
    errno?: number | null;
    field?: string | null;
    timeout?: number | null;
    operation?: string | null;
    filePath?: string | null;
}

/**
 * エラーサマリーの型定義
 */
interface ErrorSummary {
    totalErrors: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    recoverableCount: number;
    nonRecoverableCount: number;
}

/**
 * エラーグループの型定義
 */
interface ErrorGroup {
    count: number;
    errors: ErrorInfo[];
}

/**
 * タイムラインエントリの型定義
 */
interface TimelineEntry {
    timestamp: string;
    type: string;
    severity: string;
    message: string;
}

/**
 * エラーレポートの型定義
 */
interface ErrorReport {
    summary: ErrorSummary;
    errorsByType: Record<string, ErrorGroup>;
    errorsBySeverity: Record<string, ErrorGroup>;
    timeline: TimelineEntry[];
    totalErrors: number;
    generatedAt: string;
}

/**
 * ErrorHandlerオプション
 */
interface ErrorHandlerOptions {
    logger?: Pick<Console, 'error' | 'warn' | 'info' | 'log'>;
    maxLogSize?: number;
}

/**
 * getErrorsオプション
 */
interface GetErrorsOptions {
    type?: string;
    severity?: string;
    limit?: number;
}

/**
 * エラーハンドラークラス
 */
export class ErrorHandler {
    logger: Pick<Console, 'error' | 'warn' | 'info' | 'log'>;
    errorLog: ErrorInfo[];
    maxLogSize: number;

    constructor(options: ErrorHandlerOptions = {}) {
        this.logger = options.logger || console;
        this.errorLog = [];
        this.maxLogSize = options.maxLogSize || 1000;
    }

    /**
     * エラーをハンドル
     * @param error - エラーオブジェクト
     * @param context - コンテキスト情報
     * @returns エラー情報
     */
    handle(error: Error, context: Record<string, unknown> = {}): ErrorInfo {
        const errorInfo = this.analyzeError(error, context);
        this.logError(errorInfo);
        this.recordError(errorInfo);

        return errorInfo;
    }

    /**
     * エラーを分析
     * @param error - エラーオブジェクト
     * @param context - コンテキスト情報
     * @returns エラー情報
     */
    analyzeError(error: Error, context: Record<string, unknown> = {}): ErrorInfo {
        const errorInfo: ErrorInfo = {
            name: error.name || 'Error',
            message: error.message || 'Unknown error',
            type: this.categorizeError(error),
            severity: this.determineSeverity(error),
            timestamp: new Date().toISOString(),
            context,
            stack: error.stack,
            recoverable: (error as PerformanceTestError).recoverable !== undefined ? (error as PerformanceTestError).recoverable : true
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
     * @param error - エラーオブジェクト
     * @returns エラータイプ
     */
    categorizeError(error: Error): string {
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
        } else if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
            return 'CONNECTION_REFUSED';
        } else if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
            return 'TIMEOUT';
        } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return 'FILE_NOT_FOUND';
        } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            return 'PERMISSION_DENIED';
        } else {
            return 'UNKNOWN';
        }
    }

    /**
     * エラーの深刻度を判定
     * @param error - エラーオブジェクト
     * @returns 深刻度（CRITICAL, HIGH, MEDIUM, LOW）
     */
    determineSeverity(error: Error): string {
        if ((error as PerformanceTestError).recoverable === false) {
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
     * @param errorInfo - エラー情報
     */
    logError(errorInfo: ErrorInfo): void {
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
     * @param errorInfo - エラー情報
     * @returns フォーマット済みログ
     */
    formatErrorLog(errorInfo: ErrorInfo): string {
        const parts: string[] = [
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
     * @param errorInfo - エラー情報
     */
    recordError(errorInfo: ErrorInfo): void {
        this.errorLog.push(errorInfo);

        // ログサイズ制限
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }
    }

    /**
     * エラーレポートを生成
     * @returns エラーレポート
     */
    generateReport(): ErrorReport {
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
     * @returns サマリー
     */
    generateSummary(): ErrorSummary {
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
     * @returns タイプ別エラー
     */
    groupErrorsByType(): Record<string, ErrorGroup> {
        const groups: Record<string, ErrorInfo[]> = {};

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
     * @returns 深刻度別エラー
     */
    groupErrorsBySeverity(): Record<string, ErrorGroup> {
        const groups: Record<string, ErrorInfo[]> = {
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
     * @returns タイムライン
     */
    generateTimeline(): TimelineEntry[] {
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
    clearLog(): void {
        this.errorLog = [];
    }

    /**
     * エラーログを取得
     * @param options - オプション
     * @returns エラーログ
     */
    getErrors(options: GetErrorsOptions = {}): ErrorInfo[] {
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
export const handleError = (error: Error, context?: Record<string, unknown>): ErrorInfo => defaultErrorHandler.handle(error, context);
export const getErrorReport = (): ErrorReport => defaultErrorHandler.generateReport();

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
