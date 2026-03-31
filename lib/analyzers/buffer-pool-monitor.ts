/**
 * Buffer Pool monitor class
 * Monitors and analyzes InnoDB Buffer Pool state
 */

import type { RowDataPacket } from 'mysql2/promise';
import { BaseAnalyzer } from './base-analyzer.js';
import type { DatabaseConnection } from '../core/database-connection.js';
import type { TestConfig, BufferPoolAnalysisResult } from '../types/index.js';

export class BufferPoolMonitor extends BaseAnalyzer {
    constructor(connection: DatabaseConnection, config: TestConfig) {
        super(connection, config);
    }

    /**
     * Execute Buffer Pool analysis
     * @returns Buffer Pool analysis result, or null if disabled or on error
     */
    async analyze(): Promise<BufferPoolAnalysisResult | null> {
        if (!this.config.enableBufferPoolMonitoring) {
            return null;
        }

        try {
            const [rows] = await this.connection.query(`
                SELECT
                    VARIABLE_NAME,
                    VARIABLE_VALUE
                FROM performance_schema.global_status
                WHERE VARIABLE_NAME LIKE 'Innodb_buffer_pool%'
                ORDER BY VARIABLE_NAME
            `) as [RowDataPacket[], unknown];

            const bufferPoolData: Record<string, string> = {};
            rows.forEach((row: RowDataPacket) => {
                bufferPoolData[row.VARIABLE_NAME as string] = row.VARIABLE_VALUE as string;
            });

            const reads = parseInt(bufferPoolData['Innodb_buffer_pool_reads'] || '0');
            const readRequests = parseInt(bufferPoolData['Innodb_buffer_pool_read_requests'] || '1');
            const hitRatio = ((readRequests - reads) / readRequests * 100).toFixed(2);

            return {
                rawData: bufferPoolData,
                metrics: {
                    hitRatio: parseFloat(hitRatio),
                    reads: reads,
                    readRequests: readRequests,
                    pagesTotal: parseInt(bufferPoolData['Innodb_buffer_pool_pages_total'] || '0'),
                    pagesFree: parseInt(bufferPoolData['Innodb_buffer_pool_pages_free'] || '0'),
                    pagesData: parseInt(bufferPoolData['Innodb_buffer_pool_pages_data'] || '0')
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Buffer Pool analysis error: ${(error as Error).message}`);
            return null;
        }
    }
}
