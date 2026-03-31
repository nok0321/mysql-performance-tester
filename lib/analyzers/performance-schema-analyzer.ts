/**
 * Performance Schema analysis class
 * Collects and analyzes comprehensive metrics from MySQL Performance Schema
 */

import type { RowDataPacket } from 'mysql2/promise';
import { BaseAnalyzer } from './base-analyzer.js';
import type { DatabaseConnection } from '../core/database-connection.js';
import type {
    TestConfig,
    PerformanceSchemaMetrics,
    TopQueryEntry,
    WaitEventEntry,
    TableScanEntry,
} from '../types/index.js';

export class PerformanceSchemaAnalyzer extends BaseAnalyzer {
    constructor(connection: DatabaseConnection, config: TestConfig) {
        super(connection, config);
    }

    /**
     * Collect comprehensive Performance Schema metrics
     * @returns Collected metrics, or null if disabled or on error
     */
    async collectMetrics(): Promise<PerformanceSchemaMetrics | null> {
        if (!this.config.enablePerformanceSchema) {
            return null;
        }

        const metrics: PerformanceSchemaMetrics = {
            bufferPool: null,
            topQueries: null,
            waitEvents: null,
            tableScans: null,
            connections: null,
        };

        try {
            // Buffer Pool statistics
            metrics.bufferPool = await this.getBufferPoolStats();

            // Top query statistics
            metrics.topQueries = await this.getTopQueries();

            // Wait Event statistics
            metrics.waitEvents = await this.getWaitEvents();

            // Table scan statistics
            metrics.tableScans = await this.getTableScans();

            // Connection statistics
            metrics.connections = await this.getConnectionStats();

            return metrics;
        } catch (error) {
            console.warn(`Performance Schema metrics collection error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get Buffer Pool statistics
     * @returns Buffer Pool stats, or null on error
     */
    async getBufferPoolStats(): Promise<Record<string, number | string> | null> {
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
            `) as [RowDataPacket[], unknown];

            const stats: Record<string, number | string> = {};
            rows.forEach((row: RowDataPacket) => {
                stats[row.VARIABLE_NAME as string] = parseInt(row.VARIABLE_VALUE as string);
            });

            const reads = (stats['Innodb_buffer_pool_reads'] as number) || 0;
            const requests = (stats['Innodb_buffer_pool_read_requests'] as number) || 1;
            stats.hitRatio = ((requests - reads) / requests * 100).toFixed(2);

            return stats;
        } catch (_error) {
            console.warn('Buffer pool stats query error:', (_error as Error).message);
            return null;
        }
    }

    /**
     * Get top queries by total wait time
     * @returns List of top queries, or null on error
     */
    async getTopQueries(): Promise<TopQueryEntry[] | null> {
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
            `) as [RowDataPacket[], unknown];

            return rows.map((row: RowDataPacket) => ({
                query: (row.DIGEST_TEXT as string | undefined)?.substring(0, 100) + '...',
                executionCount: row.execution_count as number,
                avgLatency: parseFloat((row.avg_latency_ms as number | undefined)?.toFixed(3) ?? '0') || 0,
                maxLatency: parseFloat((row.max_latency_ms as number | undefined)?.toFixed(3) ?? '0') || 0,
                rowsExamined: row.total_rows_examined as number,
                rowsSent: row.total_rows_sent as number,
            }));
        } catch (_error) {
            console.warn('Top queries fetch error:', (_error as Error).message);
            return null;
        }
    }

    /**
     * Get Wait Event statistics
     * @returns List of wait events, or null on error
     */
    async getWaitEvents(): Promise<WaitEventEntry[] | null> {
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
            `) as [RowDataPacket[], unknown];

            return rows.map((row: RowDataPacket) => ({
                eventName: row.event_name as string,
                count: row.count as number,
                totalWait: parseFloat((row.total_wait_ms as number | undefined)?.toFixed(3) ?? '0') || 0,
            }));
        } catch (_error) {
            console.warn('Wait events fetch error:', (_error as Error).message);
            return null;
        }
    }

    /**
     * Get table scan statistics
     * @returns List of table scans, or null on error
     */
    async getTableScans(): Promise<TableScanEntry[] | null> {
        try {
            // Use sys schema if available
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
            `) as [RowDataPacket[], unknown];

            return rows.map((row: RowDataPacket) => ({
                schema: row.object_schema as string,
                table: row.object_name as string,
                fullScans: row.rows_full_scanned as number,
            }));
        } catch (_error) {
            console.warn('Table scans fetch error:', (_error as Error).message);
            return null;
        }
    }

    /**
     * Get connection statistics
     * @returns Connection stats, or null on error
     */
    async getConnectionStats(): Promise<Record<string, number> | null> {
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
            `) as [RowDataPacket[], unknown];

            const stats: Record<string, number> = {};
            rows.forEach((row: RowDataPacket) => {
                stats[row.VARIABLE_NAME as string] = parseInt(row.VARIABLE_VALUE as string);
            });

            return stats;
        } catch (_error) {
            console.warn('Connection stats fetch error:', (_error as Error).message);
            return null;
        }
    }
}
