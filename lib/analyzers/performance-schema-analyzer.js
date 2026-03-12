/**
 * Performance Schema分析クラス
 * MySQLのPerformance Schemaから包括的なメトリクスを収集・分析
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class PerformanceSchemaAnalyzer extends BaseAnalyzer {
    constructor(connection, config) {
        super(connection, config);
    }

    /**
     * 包括的なPerformance Schemaメトリクスの収集
     * @returns {Promise<Object|null>} 収集されたメトリクス
     */
    async collectMetrics() {
        if (!this.config.enablePerformanceSchema) {
            return null;
        }

        const metrics = {};

        try {
            // Buffer Pool統計
            metrics.bufferPool = await this.getBufferPoolStats();

            // トップクエリ統計
            metrics.topQueries = await this.getTopQueries();

            // Wait Event統計
            metrics.waitEvents = await this.getWaitEvents();

            // テーブルスキャン統計
            metrics.tableScans = await this.getTableScans();

            // 接続統計
            metrics.connections = await this.getConnectionStats();

            return metrics;
        } catch (error) {
            console.warn(`Performance Schemaメトリクス収集エラー: ${error.message}`);
            return null;
        }
    }

    /**
     * Buffer Pool統計の取得
     * @returns {Promise<Object|null>} Buffer Pool統計
     */
    async getBufferPoolStats() {
        try {
            const [rows] = await this.connection.query(`
                SELECT
                    VARIABLE_NAME,
                    VARIABLE_VALUE
                FROM performance_schema.global_status
                WHERE VARIABLE_NAME IN (
                    'Innodb_buffer_pool_reads',
                    'Innodb_buffer_pool_read_requests',
                    'Innodb_buffer_pool_pages_total',
                    'Innodb_buffer_pool_pages_free',
                    'Innodb_buffer_pool_pages_data'
                )
            `);

            const stats = {};
            rows.forEach(row => {
                stats[row.VARIABLE_NAME] = parseInt(row.VARIABLE_VALUE);
            });

            const reads = stats['Innodb_buffer_pool_reads'] || 0;
            const requests = stats['Innodb_buffer_pool_read_requests'] || 1;
            stats.hitRatio = ((requests - reads) / requests * 100).toFixed(2);

            return stats;
        } catch (error) {
            return null;
        }
    }

    /**
     * トップクエリの取得
     * @returns {Promise<Array|null>} トップクエリのリスト
     */
    async getTopQueries() {
        try {
            const [rows] = await this.connection.query(`
                SELECT
                    DIGEST_TEXT,
                    COUNT_STAR as execution_count,
                    AVG_TIMER_WAIT/1000000000 as avg_latency_ms,
                    MAX_TIMER_WAIT/1000000000 as max_latency_ms,
                    SUM_ROWS_EXAMINED as total_rows_examined,
                    SUM_ROWS_SENT as total_rows_sent
                FROM performance_schema.events_statements_summary_by_digest
                WHERE DIGEST_TEXT IS NOT NULL
                ORDER BY SUM_TIMER_WAIT DESC
                LIMIT 10
            `);

            return rows.map(row => ({
                query: row.DIGEST_TEXT?.substring(0, 100) + '...',
                executionCount: row.execution_count,
                avgLatency: parseFloat(row.avg_latency_ms?.toFixed(3)) || 0,
                maxLatency: parseFloat(row.max_latency_ms?.toFixed(3)) || 0,
                rowsExamined: row.total_rows_examined,
                rowsSent: row.total_rows_sent
            }));
        } catch (error) {
            return null;
        }
    }

    /**
     * Wait Event統計の取得
     * @returns {Promise<Array|null>} Wait Eventのリスト
     */
    async getWaitEvents() {
        try {
            const [rows] = await this.connection.query(`
                SELECT
                    event_name,
                    COUNT_STAR as count,
                    SUM_TIMER_WAIT/1000000000 as total_wait_ms
                FROM performance_schema.events_waits_summary_global_by_event_name
                WHERE event_name LIKE 'wait/io%'
                    AND COUNT_STAR > 0
                ORDER BY SUM_TIMER_WAIT DESC
                LIMIT 10
            `);

            return rows.map(row => ({
                eventName: row.event_name,
                count: row.count,
                totalWait: parseFloat(row.total_wait_ms?.toFixed(3)) || 0
            }));
        } catch (error) {
            return null;
        }
    }

    /**
     * テーブルスキャン統計の取得
     * @returns {Promise<Array|null>} テーブルスキャンのリスト
     */
    async getTableScans() {
        try {
            // sys schemaを使用（利用可能な場合）
            const [rows] = await this.connection.query(`
                SELECT
                    object_schema,
                    object_name,
                    rows_full_scanned
                FROM performance_schema.table_io_waits_summary_by_table
                WHERE object_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
                    AND rows_full_scanned > 0
                ORDER BY rows_full_scanned DESC
                LIMIT 10
            `);

            return rows.map(row => ({
                schema: row.object_schema,
                table: row.object_name,
                fullScans: row.rows_full_scanned
            }));
        } catch (error) {
            return null;
        }
    }

    /**
     * 接続統計の取得
     * @returns {Promise<Object|null>} 接続統計
     */
    async getConnectionStats() {
        try {
            const [rows] = await this.connection.query(`
                SELECT
                    VARIABLE_NAME,
                    VARIABLE_VALUE
                FROM performance_schema.global_status
                WHERE VARIABLE_NAME IN (
                    'Threads_connected',
                    'Threads_running',
                    'Threads_created',
                    'Max_used_connections',
                    'Aborted_connects'
                )
            `);

            const stats = {};
            rows.forEach(row => {
                stats[row.VARIABLE_NAME] = parseInt(row.VARIABLE_VALUE);
            });

            return stats;
        } catch (error) {
            return null;
        }
    }
}
