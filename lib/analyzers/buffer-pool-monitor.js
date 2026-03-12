/**
 * Buffer Pool監視クラス
 * InnoDBのBuffer Poolの状態を監視・分析
 */

import { BaseAnalyzer } from './base-analyzer.js';

export class BufferPoolMonitor extends BaseAnalyzer {
    constructor(connection, config) {
        super(connection, config);
    }

    /**
     * Buffer Pool分析の実行
     * @returns {Promise<Object|null>} Buffer Pool分析結果
     */
    async analyze() {
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
            `);

            const bufferPoolData = {};
            rows.forEach(row => {
                bufferPoolData[row.VARIABLE_NAME] = row.VARIABLE_VALUE;
            });

            const reads = parseInt(bufferPoolData['Innodb_buffer_pool_reads'] || 0);
            const readRequests = parseInt(bufferPoolData['Innodb_buffer_pool_read_requests'] || 1);
            const hitRatio = ((readRequests - reads) / readRequests * 100).toFixed(2);

            return {
                rawData: bufferPoolData,
                metrics: {
                    hitRatio: parseFloat(hitRatio),
                    reads: reads,
                    readRequests: readRequests,
                    pagesTotal: parseInt(bufferPoolData['Innodb_buffer_pool_pages_total'] || 0),
                    pagesFree: parseInt(bufferPoolData['Innodb_buffer_pool_pages_free'] || 0),
                    pagesData: parseInt(bufferPoolData['Innodb_buffer_pool_pages_data'] || 0)
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Buffer Pool分析エラー: ${error.message}`);
            return null;
        }
    }
}
