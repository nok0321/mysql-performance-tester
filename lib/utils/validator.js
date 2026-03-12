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
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

/**
 * SQLクエリをバリデート
 * @param {string} query - SQLクエリ
 * @param {Object} [options] - オプション
 * @param {boolean} [options.allowEmpty=false] - 空文字列を許可
 * @param {Array<string>} [options.allowedStatements] - 許可するステートメント（SELECT, INSERT等）
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 *
 * @example
 * validateQuery('SELECT * FROM users'); // true
 * validateQuery(''); // ValidationError
 * validateQuery('DROP TABLE users', { allowedStatements: ['SELECT'] }); // ValidationError
 */
export function validateQuery(query, options = {}) {
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
    // ① 複文の2番目以降に危険なステートメントが来るケース（例: SELECT 1; DROP TABLE t）
    const multiStatementDangerousPatterns = [
        /;\s*DROP\s+/i,
        /;\s*DELETE\s+FROM\s+/i,
        /;\s*TRUNCATE\s+/i
    ];

    // ② 単文として危険なステートメント（例: DROP TABLE users 単体）
    // パフォーマンステストツールの性質上、これらを完全に禁止はしないが
    // 誤操作防止のため allowedStatements が指定されていない場合でも警告エラーとして検知する。
    // allowedStatements: ['SELECT'] を指定することで SELECT のみに制限できる。
    const standaloneDangerousPatterns = [
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
 * @param {Object} config - テスト設定オブジェクト
 * @param {Object} config.test - テスト設定
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 *
 * @example
 * validateConfig({ test: { testIterations: 10, parallelThreads: 5 } }); // true
 * validateConfig({ test: { testIterations: -1 } }); // ValidationError
 */
export function validateConfig(config) {
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
        validatePercentage(test.warmupPercentage, 'warmupPercentage');
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
 * @param {number} percentile - パーセンタイル値（0-100）
 * @param {string} [fieldName='percentile'] - フィールド名
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 *
 * @example
 * validatePercentile(95); // true
 * validatePercentile(150); // ValidationError
 */
export function validatePercentile(percentile, fieldName = 'percentile') {
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
 * @param {number} value - 値
 * @param {string} fieldName - フィールド名
 * @param {Object} [options] - オプション
 * @param {number} [options.min] - 最小値
 * @param {number} [options.max] - 最大値
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 *
 * @example
 * validatePositiveInteger(10, 'count'); // true
 * validatePositiveInteger(-1, 'count'); // ValidationError
 * validatePositiveInteger(5, 'count', { min: 10 }); // ValidationError
 */
export function validatePositiveInteger(value, fieldName, options = {}) {
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
 * @param {string} value - 値
 * @param {string} fieldName - フィールド名
 * @param {Object} [options] - オプション
 * @param {boolean} [options.allowEmpty=false] - 空文字列を許可
 * @param {number} [options.minLength] - 最小長
 * @param {number} [options.maxLength] - 最大長
 * @param {RegExp} [options.pattern] - パターン
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 *
 * @example
 * validateString('test', 'name'); // true
 * validateString('', 'name'); // ValidationError
 * validateString('test', 'name', { minLength: 5 }); // ValidationError
 */
export function validateString(value, fieldName, options = {}) {
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
 * @param {Object} dbConfig - データベース設定
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 */
export function validateDatabaseConfig(dbConfig) {
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
 * @param {Array} value - 値
 * @param {string} fieldName - フィールド名
 * @param {Object} [options] - オプション
 * @param {boolean} [options.allowEmpty=false] - 空配列を許可
 * @param {number} [options.minLength] - 最小長
 * @param {number} [options.maxLength] - 最大長
 * @param {Function} [options.itemValidator] - 各要素のバリデーター関数
 * @throws {ValidationError} バリデーションエラー
 * @returns {boolean} true（エラーがなければ）
 */
export function validateArray(value, fieldName, options = {}) {
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
                    `${fieldName}[${index}]: ${error.message}`,
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
