/**
 * Validator Utility - バリデーションユーティリティ
 *
 * 入力値の検証機能を提供
 *
 * 機能:
 * - クエリのバリデーション
 * - 設定値のバリデーション
 * - パーセンタイルのバリデーション
 * - 数値範囲のチェック
 *
 * @module utils/validator
 */

/**
 * バリデーションエラークラス
 */
export class ValidationError extends Error {
    field: string | null;

    constructor(message: string, field: string | null = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

/**
 * クエリバリデーションオプション
 */
interface ValidateQueryOptions {
    allowEmpty?: boolean;
    allowedStatements?: string[] | null;
}

/**
 * テスト設定オブジェクト
 */
interface TestConfig {
    testIterations?: number;
    parallelThreads?: number;
    warmupIterations?: number | null;
    warmupPercentage?: number;
    outlierMethod?: string;
}

/**
 * テスト設定を含むコンフィグオブジェクト
 */
interface Config {
    test: TestConfig;
    [key: string]: unknown;
}

/**
 * 正の整数バリデーションオプション
 */
interface PositiveIntegerOptions {
    min?: number;
    max?: number;
}

/**
 * 文字列バリデーションオプション
 */
interface ValidateStringOptions {
    allowEmpty?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp | null;
}

/**
 * データベース設定オブジェクト
 */
interface DatabaseConfig {
    host?: string;
    port?: number;
    user?: string;
    database?: string;
    connectTimeout?: number;
    acquireTimeout?: number;
    [key: string]: unknown;
}

/**
 * 配列バリデーションオプション
 */
interface ValidateArrayOptions {
    allowEmpty?: boolean;
    minLength?: number;
    maxLength?: number;
    itemValidator?: ((item: unknown, index: number) => void) | null;
}

/**
 * SQLクエリをバリデート
 * @param query - SQLクエリ
 * @param options - オプション
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 *
 * @example
 * validateQuery('SELECT * FROM users'); // true
 * validateQuery(''); // ValidationError
 * validateQuery('DROP TABLE users', { allowedStatements: ['SELECT'] }); // ValidationError
 */
export function validateQuery(query: string, options: ValidateQueryOptions = {}): boolean {
    const { allowEmpty = false, allowedStatements = null } = options;

    // null/undefinedチェック
    if (query === null || query === undefined) {
        throw new ValidationError('Query cannot be null or undefined', 'query');
    }

    // 型チェック
    if (typeof query !== 'string') {
        throw new ValidationError('Query must be a string', 'query');
    }

    // 空文字列チェック
    if (!allowEmpty && query.trim().length === 0) {
        throw new ValidationError('Query cannot be empty', 'query');
    }

    // ステートメントタイプチェック
    if (allowedStatements && Array.isArray(allowedStatements)) {
        const trimmedQuery = query.trim().toUpperCase();
        const isAllowed = allowedStatements.some(stmt =>
            trimmedQuery.startsWith(stmt.toUpperCase())
        );

        if (!isAllowed) {
            throw new ValidationError(
                `Query must start with one of: ${allowedStatements.join(', ')}`,
                'query'
            );
        }
    }

    // 危険なクエリパターンをチェック
    // 1. 複文の2番目以降に危険なステートメントが来るケース（例: SELECT 1; DROP TABLE t）
    const multiStatementDangerousPatterns: RegExp[] = [
        /;\s*DROP\s+/i,
        /;\s*DELETE\s+FROM\s+/i,
        /;\s*TRUNCATE\s+/i
    ];

    // 2. 単文として危険なステートメント（例: DROP TABLE users 単体）
    // パフォーマンステストツールの性質上、これらを完全に禁止はしないが
    // 誤操作防止のため allowedStatements が指定されていない場合でも警告エラーとして検知する。
    // allowedStatements: ['SELECT'] を指定することで SELECT のみに制限できる。
    const standaloneDangerousPatterns: RegExp[] = [
        /^\s*DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i,
        /^\s*TRUNCATE\s+(TABLE\s+)?\S/i,
        /^\s*DELETE\s+FROM\s+\S/i,
        /^\s*ALTER\s+TABLE\s+\S.*\s+DROP\s+/i,
    ];

    for (const pattern of multiStatementDangerousPatterns) {
        if (pattern.test(query)) {
            throw new ValidationError(
                'Query contains potentially dangerous multi-statement patterns (e.g., SELECT 1; DROP TABLE t)',
                'query'
            );
        }
    }

    for (const pattern of standaloneDangerousPatterns) {
        if (pattern.test(query)) {
            throw new ValidationError(
                'Query contains a potentially destructive statement (DROP / TRUNCATE / DELETE FROM / ALTER ... DROP). ' +
                'If intentional, use allowedStatements to explicitly permit this statement type.',
                'query'
            );
        }
    }

    return true;
}

/**
 * テスト設定をバリデート
 * @param config - テスト設定オブジェクト
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 *
 * @example
 * validateConfig({ test: { testIterations: 10, parallelThreads: 5 } }); // true
 * validateConfig({ test: { testIterations: -1 } }); // ValidationError
 */
export function validateConfig(config: Config): boolean {
    if (!config || typeof config !== 'object') {
        throw new ValidationError('Config must be an object', 'config');
    }

    if (!config.test || typeof config.test !== 'object') {
        throw new ValidationError('Config must have a test property', 'config.test');
    }

    const { test } = config;

    // testIterations
    if (test.testIterations !== undefined) {
        validatePositiveInteger(
            test.testIterations,
            'testIterations',
            { min: 1, max: 10000 }
        );
    }

    // parallelThreads
    if (test.parallelThreads !== undefined) {
        validatePositiveInteger(
            test.parallelThreads,
            'parallelThreads',
            { min: 1, max: 1000 }
        );
    }

    // warmupIterations
    if (test.warmupIterations !== undefined && test.warmupIterations !== null) {
        validatePositiveInteger(
            test.warmupIterations,
            'warmupIterations',
            { min: 0, max: 1000 }
        );
    }

    // warmupPercentage
    if (test.warmupPercentage !== undefined) {
        validatePercentile(test.warmupPercentage, 'warmupPercentage');
    }

    // outlierMethod
    if (test.outlierMethod !== undefined) {
        const validMethods = ['iqr', 'zscore', 'mad'];
        if (!validMethods.includes(test.outlierMethod)) {
            throw new ValidationError(
                `outlierMethod must be one of: ${validMethods.join(', ')}`,
                'outlierMethod'
            );
        }
    }

    return true;
}

/**
 * パーセンタイル値をバリデート
 * @param percentile - パーセンタイル値（0-100）
 * @param fieldName - フィールド名
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 *
 * @example
 * validatePercentile(95); // true
 * validatePercentile(150); // ValidationError
 */
export function validatePercentile(percentile: number, fieldName: string = 'percentile'): boolean {
    if (percentile === null || percentile === undefined) {
        throw new ValidationError(
            `${fieldName} cannot be null or undefined`,
            fieldName
        );
    }

    if (typeof percentile !== 'number' || isNaN(percentile)) {
        throw new ValidationError(
            `${fieldName} must be a number`,
            fieldName
        );
    }

    if (percentile < 0 || percentile > 100) {
        throw new ValidationError(
            `${fieldName} must be between 0 and 100`,
            fieldName
        );
    }

    return true;
}

/**
 * 正の整数をバリデート
 * @param value - 値
 * @param fieldName - フィールド名
 * @param options - オプション
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 *
 * @example
 * validatePositiveInteger(10, 'count'); // true
 * validatePositiveInteger(-1, 'count'); // ValidationError
 * validatePositiveInteger(5, 'count', { min: 10 }); // ValidationError
 */
export function validatePositiveInteger(value: number, fieldName: string, options: PositiveIntegerOptions = {}): boolean {
    const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;

    if (value === null || value === undefined) {
        throw new ValidationError(
            `${fieldName} cannot be null or undefined`,
            fieldName
        );
    }

    if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(
            `${fieldName} must be a number`,
            fieldName
        );
    }

    if (!Number.isInteger(value)) {
        throw new ValidationError(
            `${fieldName} must be an integer`,
            fieldName
        );
    }

    if (value < min) {
        throw new ValidationError(
            `${fieldName} must be greater than or equal to ${min}`,
            fieldName
        );
    }

    if (value > max) {
        throw new ValidationError(
            `${fieldName} must be less than or equal to ${max}`,
            fieldName
        );
    }

    return true;
}

/**
 * 文字列をバリデート
 * @param value - 値
 * @param fieldName - フィールド名
 * @param options - オプション
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 *
 * @example
 * validateString('test', 'name'); // true
 * validateString('', 'name'); // ValidationError
 * validateString('test', 'name', { minLength: 5 }); // ValidationError
 */
export function validateString(value: string, fieldName: string, options: ValidateStringOptions = {}): boolean {
    const {
        allowEmpty = false,
        minLength = 0,
        maxLength = Number.MAX_SAFE_INTEGER,
        pattern = null
    } = options;

    if (value === null || value === undefined) {
        throw new ValidationError(
            `${fieldName} cannot be null or undefined`,
            fieldName
        );
    }

    if (typeof value !== 'string') {
        throw new ValidationError(
            `${fieldName} must be a string`,
            fieldName
        );
    }

    if (!allowEmpty && value.trim().length === 0) {
        throw new ValidationError(
            `${fieldName} cannot be empty`,
            fieldName
        );
    }

    if (value.length < minLength) {
        throw new ValidationError(
            `${fieldName} must be at least ${minLength} characters`,
            fieldName
        );
    }

    if (value.length > maxLength) {
        throw new ValidationError(
            `${fieldName} must be at most ${maxLength} characters`,
            fieldName
        );
    }

    if (pattern && !pattern.test(value)) {
        throw new ValidationError(
            `${fieldName} does not match the required pattern`,
            fieldName
        );
    }

    return true;
}

/**
 * データベース接続設定をバリデート
 * @param dbConfig - データベース設定
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 */
export function validateDatabaseConfig(dbConfig: DatabaseConfig): boolean {
    if (!dbConfig || typeof dbConfig !== 'object') {
        throw new ValidationError('Database config must be an object', 'dbConfig');
    }

    // host
    if (dbConfig.host !== undefined) {
        validateString(dbConfig.host, 'host', { minLength: 1, maxLength: 255 });
    }

    // port
    if (dbConfig.port !== undefined) {
        validatePositiveInteger(dbConfig.port, 'port', { min: 1, max: 65535 });
    }

    // user
    if (dbConfig.user !== undefined) {
        validateString(dbConfig.user, 'user', { minLength: 1, maxLength: 255 });
    }

    // database
    if (dbConfig.database !== undefined) {
        validateString(dbConfig.database, 'database', { minLength: 1, maxLength: 255 });
    }

    // timeout values
    if (dbConfig.connectTimeout !== undefined) {
        validatePositiveInteger(
            dbConfig.connectTimeout,
            'connectTimeout',
            { min: 0, max: 300000 }
        );
    }

    if (dbConfig.acquireTimeout !== undefined) {
        validatePositiveInteger(
            dbConfig.acquireTimeout,
            'acquireTimeout',
            { min: 0, max: 300000 }
        );
    }

    return true;
}

/**
 * 配列をバリデート
 * @param value - 値
 * @param fieldName - フィールド名
 * @param options - オプション
 * @throws バリデーションエラー
 * @returns true（エラーがなければ）
 */
export function validateArray(value: unknown[], fieldName: string, options: ValidateArrayOptions = {}): boolean {
    const {
        allowEmpty = false,
        minLength = 0,
        maxLength = Number.MAX_SAFE_INTEGER,
        itemValidator = null
    } = options;

    if (value === null || value === undefined) {
        throw new ValidationError(
            `${fieldName} cannot be null or undefined`,
            fieldName
        );
    }

    if (!Array.isArray(value)) {
        throw new ValidationError(
            `${fieldName} must be an array`,
            fieldName
        );
    }

    if (!allowEmpty && value.length === 0) {
        throw new ValidationError(
            `${fieldName} cannot be empty`,
            fieldName
        );
    }

    if (value.length < minLength) {
        throw new ValidationError(
            `${fieldName} must have at least ${minLength} items`,
            fieldName
        );
    }

    if (value.length > maxLength) {
        throw new ValidationError(
            `${fieldName} must have at most ${maxLength} items`,
            fieldName
        );
    }

    if (itemValidator) {
        value.forEach((item, index) => {
            try {
                itemValidator(item, index);
            } catch (error) {
                throw new ValidationError(
                    `${fieldName}[${index}]: ${(error as Error).message}`,
                    `${fieldName}[${index}]`
                );
            }
        });
    }

    return true;
}

/**
 * デフォルトエクスポート
 */
export default {
    ValidationError,
    validateQuery,
    validateConfig,
    validatePercentile,
    validatePositiveInteger,
    validateString,
    validateDatabaseConfig,
    validateArray
};
