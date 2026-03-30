/**
 * Optimizer Trace analysis class
 * Captures and analyzes MySQL optimizer trace information
 */

import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { BaseAnalyzer } from './base-analyzer.js';
import type { DatabaseConnection } from '../core/database-connection.js';
import type { TestConfig, OptimizerTraceResult } from '../types/index.js';

export class OptimizerTraceAnalyzer extends BaseAnalyzer {
    constructor(connection: DatabaseConnection, config: TestConfig) {
        super(connection, config);
    }

    /**
     * Capture optimizer trace for a query
     * @param query - The query to trace
     * @returns Optimizer trace result, or null if disabled or on error
     */
    async captureTrace(query: string): Promise<OptimizerTraceResult | null> {
        if (!this.config.enableOptimizerTrace) {
            return null;
        }

        let traceConnection: PoolConnection | null = null;
        try {
            traceConnection = await this.connection.getConnection();

            // Enable optimizer trace
            await traceConnection.query('SET optimizer_trace="enabled=on"');
            await traceConnection.query('SET optimizer_trace_max_mem_size=1000000');
            await traceConnection.query('SET end_markers_in_json=on');

            // Execute query to generate trace
            await traceConnection.query(query);

            // Retrieve trace information
            const [rows] = await traceConnection.query(
                'SELECT TRACE FROM INFORMATION_SCHEMA.OPTIMIZER_TRACE'
            ) as [RowDataPacket[], unknown];

            // Disable optimizer trace
            await traceConnection.query('SET optimizer_trace="enabled=off"');

            if (rows.length > 0) {
                return {
                    trace: JSON.parse((rows[0].TRACE as string).replace(/\/\*[\s\S]*?\*\//g, '')) as Record<string, unknown>,
                    timestamp: new Date().toISOString()
                };
            }

            return null;
        } catch (error) {
            console.warn(`Optimizer Trace取得エラー: ${(error as Error).message}`);
            return null;
        } finally {
            if (traceConnection) {
                traceConnection.release();
            }
        }
    }
}
