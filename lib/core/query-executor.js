/**
 * QueryExecutor - クエリ実行管理
 *
 * SQLクエリの実行と計測を担当するクラス
 * - 単一クエリの実行と時間計測
 * - バッチ実行
 * - エラーハンドリング
 */

import { performance } from 'perf_hooks';

/**
 * EXPLAIN に渡すクエリが単一ステートメントであることを確認する。
 *
 * multipleStatements:false でもプール外から呼ばれる可能性があるため、
 * ここで二重に防御する。クォート内のセミコロンは無視する簡易実装。
 *
 * @param {string} query
 * @throws {Error} 複数ステートメントが検出された場合
 */
function assertSingleStatement(query) {
  // クォート内のセミコロンを除去してからチェック
  const stripped = query
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")   // シングルクォート文字列
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')   // ダブルクォート文字列
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');  // バッククォート識別子

  // 末尾以外にセミコロンがある場合は複数ステートメントとみなす
  const withoutTrailingSemicolon = stripped.trimEnd().replace(/;$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('EXPLAIN には単一ステートメントのみ指定できます');
  }
}

export class QueryExecutor {
    /**
     * QueryExecutorを初期化
     * @param {import('./database-connection.js').DatabaseConnection} dbConnection - データベース接続
     */
    constructor(dbConnection) {
        this.db = dbConnection;
    }

    /**
     * クエリを実行（時間計測付き）
     * @param {string} query - SQLクエリ
     * @returns {Promise<Object>} 実行結果
     */
    async executeWithTiming(query) {
        const startTime = performance.now();

        try {
            const [rows] = await this.db.execute(query);
            const duration = performance.now() - startTime;

            return {
                success: true,
                duration: duration,
                rowCount: rows.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            const duration = performance.now() - startTime;

            return {
                success: false,
                duration: duration,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * クエリを実行（時間計測なし）
     * @param {string} query - SQLクエリ
     * @param {Array} [params=[]] - パラメータ
     * @returns {Promise<Array>} 実行結果の行
     */
    async executeQuery(query, params = []) {
        try {
            const [rows] = await this.db.execute(query, params);
            return rows;
        } catch (error) {
            console.error(`Query execution error: ${error.message}`);
            throw error;
        }
    }

    /**
     * 複数のクエリをバッチ実行
     * @param {string[]} queries - SQLクエリの配列
     * @param {Object} [options={}] - オプション
     * @param {boolean} [options.stopOnError=false] - エラー時に停止するか
     * @param {boolean} [options.measureTiming=true] - 時間を計測するか
     * @returns {Promise<Object[]>} 実行結果の配列
     */
    async executeBatch(queries, options = {}) {
        const {
            stopOnError = false,
            measureTiming = true
        } = options;

        const results = [];

        for (let i = 0; i < queries.length; i++) {
            const query = queries[i];

            try {
                const result = measureTiming
                    ? await this.executeWithTiming(query)
                    : await this.executeQuery(query);

                results.push({
                    index: i,
                    query: query,
                    result: measureTiming ? result : { success: true, rowCount: result.length },
                    error: null
                });

                if (!measureTiming || !result.success) {
                    if (stopOnError) {
                        break;
                    }
                }
            } catch (error) {
                results.push({
                    index: i,
                    query: query,
                    result: null,
                    error: error.message
                });

                if (stopOnError) {
                    break;
                }
            }
        }

        return results;
    }

    /**
     * クエリを指定回数実行して統計を取得
     * @param {string} query - SQLクエリ
     * @param {number} iterations - 実行回数
     * @param {Object} [options={}] - オプション
     * @param {Function} [options.onProgress] - 進捗コールバック関数
     * @returns {Promise<Object[]>} 実行結果の配列
     */
    async executeMultiple(query, iterations, options = {}) {
        const { onProgress } = options;
        const results = [];

        for (let i = 0; i < iterations; i++) {
            const result = await this.executeWithTiming(query);
            results.push(result);

            if (onProgress && typeof onProgress === 'function') {
                onProgress(i + 1, iterations, result);
            }
        }

        return results;
    }

    /**
     * トランザクション内でクエリを実行
     * @param {Function} callback - トランザクション内で実行する関数
     * @returns {Promise<any>} コールバックの結果
     */
    async executeInTransaction(callback) {
        const connection = await this.db.getConnection();

        try {
            await connection.beginTransaction();

            const result = await callback(connection);

            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * クエリの実行計画を取得
     * @param {string} query - SQLクエリ
     * @param {string} [format='JSON'] - 出力形式（JSON, TREE, TRADITIONAL）
     * @returns {Promise<Object>} 実行計画
     */
    async getExecutionPlan(query, format = 'JSON') {
        try {
            assertSingleStatement(query);

            const explainQuery = format === 'JSON'
                ? `EXPLAIN FORMAT=JSON ${query}`
                : `EXPLAIN ${query}`;

            const [rows] = await this.db.query(explainQuery);

            if (format === 'JSON') {
                return {
                    type: 'EXPLAIN',
                    format: 'JSON',
                    data: JSON.parse(rows[0].EXPLAIN),
                    timestamp: new Date().toISOString()
                };
            }

            return {
                type: 'EXPLAIN',
                format: format,
                data: rows,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Failed to get execution plan: ${error.message}`);
            return null;
        }
    }

    /**
     * EXPLAIN ANALYZEを実行（MySQL 8.0.18+）
     * @param {string} query - SQLクエリ
     * @returns {Promise<Object|null>} EXPLAIN ANALYZE結果
     */
    async getExplainAnalyze(query) {
        if (!this.db.isExplainAnalyzeSupported()) {
            console.warn('EXPLAIN ANALYZE is not supported on this MySQL version');
            return null;
        }

        try {
            assertSingleStatement(query);

            const [rows] = await this.db.query(`EXPLAIN ANALYZE ${query}`);

            // JSON形式も試行
            // SET @@explain_json_format_version はセッション変数なので、
            // 同一コネクションで SET → EXPLAIN を連続実行する必要がある。
            let jsonResult = null;
            const conn = await this.db.getConnection();
            try {
                await conn.query('SET @@explain_json_format_version = 2');
                const [jsonRows] = await conn.query(`EXPLAIN ANALYZE FORMAT=JSON ${query}`);
                jsonResult = JSON.parse(jsonRows[0]['EXPLAIN']);
            } catch (jsonError) {
                // JSON形式が使えない場合は無視
            } finally {
                conn.release();
            }

            return {
                type: 'EXPLAIN_ANALYZE',
                tree: rows[0]['EXPLAIN'],
                json: jsonResult,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Failed to execute EXPLAIN ANALYZE: ${error.message}`);
            return null;
        }
    }

    /**
     * クエリ実行統計を取得
     * @param {Object[]} results - 実行結果の配列
     * @returns {Object} 統計情報
     */
    getExecutionStatistics(results) {
        const successResults = results.filter(r => r.success);
        const failureResults = results.filter(r => !r.success);

        if (successResults.length === 0) {
            return {
                totalExecutions: results.length,
                successCount: 0,
                failureCount: failureResults.length,
                successRate: 0,
                durations: null
            };
        }

        const durations = successResults.map(r => r.duration);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);

        return {
            totalExecutions: results.length,
            successCount: successResults.length,
            failureCount: failureResults.length,
            successRate: (successResults.length / results.length) * 100,
            durations: {
                average: avg,
                min: min,
                max: max,
                total: sum
            }
        };
    }
}

export default QueryExecutor;
