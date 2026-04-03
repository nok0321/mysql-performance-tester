/**
 * EXPLAIN analysis class
 * Handles execution and analysis of EXPLAIN and EXPLAIN ANALYZE (MySQL 8.0.18+)
 *
 * This is the single authoritative implementation for EXPLAIN ANALYZE.
 * Other modules should delegate here instead of duplicating the logic.
 */

import type { RowDataPacket } from 'mysql2/promise';
import { BaseAnalyzer } from './base-analyzer.js';
import type { DatabaseConnection } from '../core/database-connection.js';
import type { TestConfig, ExplainQueryResult, ExplainAnalyzeResult } from '../types/index.js';

export class ExplainAnalyzer extends BaseAnalyzer {
    constructor(connection: DatabaseConnection, config: TestConfig) {
        super(connection, config);
    }

    /**
     * Execute EXPLAIN analysis (FORMAT=JSON)
     * @param query - The query to analyze
     * @returns EXPLAIN result, or null on error
     */
    async analyzeQuery(query: string): Promise<ExplainQueryResult | null> {
        try {
            const [rows] = await this.connection.query(`EXPLAIN FORMAT=JSON ${query}`) as [RowDataPacket[], unknown];
            return {
                type: 'EXPLAIN',
                data: JSON.parse((rows[0].EXPLAIN as string).replace(/\/\*[\s\S]*?\*\//g, '')) as Record<string, unknown>,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`EXPLAIN execution error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Execute EXPLAIN ANALYZE (MySQL 8.0.18+)
     *
     * Uses a dedicated connection from the pool for the entire sequence so that
     * the session variable SET @@explain_json_format_version does not leak into
     * the shared pool.
     *
     * @param query - The query to analyze
     * @returns EXPLAIN ANALYZE result, or null if unsupported or on error
     */
    async analyzeQueryWithExecution(query: string): Promise<ExplainAnalyzeResult | null> {
        if (!this.connection.isExplainAnalyzeSupported()) {
            return null;
        }

        const conn = await this.connection.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>(`EXPLAIN ANALYZE ${query}`);

            // Attempt JSON format output (MySQL 8.3+ with explain_json_format_version = 2).
            // Both SET and the subsequent EXPLAIN run on the same dedicated connection
            // so the session variable is isolated and released with the connection.
            let jsonResult: Record<string, unknown> | null = null;
            try {
                await conn.query('SET @@explain_json_format_version = 2');
                const [jsonRows] = await conn.query<RowDataPacket[]>(`EXPLAIN ANALYZE FORMAT=JSON ${query}`);
                jsonResult = JSON.parse((jsonRows[0]['EXPLAIN'] as string).replace(/\/\*[\s\S]*?\*\//g, '')) as Record<string, unknown>;
            } catch (_jsonError) {
                // JSON format not available on this MySQL version -- ignore
            }

            return {
                type: 'EXPLAIN_ANALYZE',
                tree: rows[0]['EXPLAIN'] as string,
                json: jsonResult,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`EXPLAIN ANALYZE execution error: ${(error as Error).message}`);
            return null;
        } finally {
            conn.release();
        }
    }
}
