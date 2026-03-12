/**
 * Optimizer Trace分析クラス
 * MySQLオプティマイザのトレース情報を取得・分析
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class OptimizerTraceAnalyzer extends BaseAnalyzer {
    constructor(connection, config) {
        super(connection, config);
    }

    /**
     * オプティマイザトレースのキャプチャ
     * @param {string} query - トレース対象のクエリ
     * @returns {Promise<Object|null>} オプティマイザトレース結果
     */
    async captureTrace(query) {
        if (!this.config.enableOptimizerTrace) {
            return null;
        }

        let traceConnection = null;
        try {
            traceConnection = await this.connection.getConnection();

            // オプティマイザトレースを有効化
            await traceConnection.query('SET optimizer_trace="enabled=on"');
            await traceConnection.query('SET optimizer_trace_max_mem_size=1000000');
            await traceConnection.query('SET end_markers_in_json=on');

            // クエリを実行してトレースを生成
            await traceConnection.query(query);

            // トレース情報を取得
            const [rows] = await traceConnection.query(
                'SELECT TRACE FROM INFORMATION_SCHEMA.OPTIMIZER_TRACE'
            );

            // オプティマイザトレースを無効化
            await traceConnection.query('SET optimizer_trace="enabled=off"');

            if (rows.length > 0) {
                return {
                    trace: JSON.parse(rows[0].TRACE.replace(/\/\*[\s\S]*?\*\//g, '')),
                    timestamp: new Date().toISOString()
                };
            }

            return null;
        } catch (error) {
            console.warn(`Optimizer Trace取得エラー: ${error.message}`);
            return null;
        } finally {
            if (traceConnection) {
                traceConnection.release();
            }
        }
    }
}
