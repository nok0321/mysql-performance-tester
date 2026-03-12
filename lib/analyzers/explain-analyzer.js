/**
 * EXPLAIN分析クラス
 * EXPLAIN および EXPLAIN ANALYZE（MySQL 8.0.18+）の実行と分析を担当
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class ExplainAnalyzer extends BaseAnalyzer {
    constructor(connection, config) {
        super(connection, config);
    }

    /**
     * EXPLAIN分析の実行（FORMAT=JSON）
     * @param {string} query - 分析対象のクエリ
     * @returns {Promise<Object|null>} EXPLAIN結果
     */
    async analyzeQuery(query) {
        try {
            const [rows] = await this.connection.query(`EXPLAIN FORMAT=JSON ${query}`);
            return {
                type: 'EXPLAIN',
                data: JSON.parse(rows[0].EXPLAIN.replace(/\/\*[\s\S]*?\*\//g, '')),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`EXPLAIN実行エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * EXPLAIN ANALYZE実行（MySQL 8.0.18+）
     * @param {string} query - 分析対象のクエリ
     * @returns {Promise<Object|null>} EXPLAIN ANALYZE結果
     */
    async analyzeQueryWithExecution(query) {
        if (!this.connection.supportsExplainAnalyze) {
            return null;
        }

        try {
            const [rows] = await this.connection.query(`EXPLAIN ANALYZE ${query}`);

            // MySQL 8.3+でJSON形式をサポートしているか確認
            let jsonResult = null;
            try {
                await this.connection.query('SET @@explain_json_format_version = 2');
                const [jsonRows] = await this.connection.query(`EXPLAIN ANALYZE FORMAT=JSON ${query}`);
                jsonResult = JSON.parse(jsonRows[0]['EXPLAIN'].replace(/\/\*[\s\S]*?\*\//g, ''));
            } catch (jsonError) {
                // JSON形式が使えない場合は無視
            }

            return {
                type: 'EXPLAIN_ANALYZE',
                tree: rows[0]['EXPLAIN'],
                json: jsonResult,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`EXPLAIN ANALYZE実行エラー: ${error.message}`);
            return null;
        }
    }
}
