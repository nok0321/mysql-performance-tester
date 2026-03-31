/**
 * File Manager
 * Manages file output for debug information, analysis results, and trace data
 */

import fs from 'fs/promises';
import path from 'path';

interface FileManagerConfigInput {
    outputDir?: string;
    enableDebugOutput?: boolean;
    enableTimestamp?: boolean;
    maxFileSize?: number;
    [key: string]: unknown;
}

interface FileManagerConfig {
    outputDir: string;
    enableDebugOutput: boolean;
    enableTimestamp: boolean;
    maxFileSize: number;
    [key: string]: unknown;
}

interface FileCounter {
    explainAnalyze: number;
    optimizerTrace: number;
    queryPlan: number;
    general: number;
}

interface ExplainAnalyzeResult {
    tree?: string;
    [key: string]: unknown;
}

interface OptimizerTraceInput {
    trace: Record<string, unknown>;
    timestamp: string;
    [key: string]: unknown;
}

interface BatchData {
    explainAnalyze?: ExplainAnalyzeResult;
    optimizerTrace?: OptimizerTraceInput;
    queryPlan?: Record<string, unknown>;
    custom?: Record<string, unknown>;
}

interface BatchResult {
    explainAnalyze?: string | null;
    optimizerTrace?: string | null;
    queryPlan?: string | null;
    custom?: Record<string, string | null>;
}

interface FileManagerSummary {
    outputDir: string;
    enabled: boolean;
    counters: FileCounter;
    totalFiles: number;
}

export class FileManager {
    config: FileManagerConfig;
    fileCounter: FileCounter;

    constructor(config: FileManagerConfigInput = {}) {
        this.config = {
            outputDir: config.outputDir || './debug-output',
            enableDebugOutput: config.enableDebugOutput !== false,
            enableTimestamp: config.enableTimestamp !== false,
            maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
            ...config
        };

        this.fileCounter = {
            explainAnalyze: 0,
            optimizerTrace: 0,
            queryPlan: 0,
            general: 0
        };
    }

    /**
     * Initialize the output directory
     */
    async initialize(): Promise<void> {
        if (!this.config.enableDebugOutput) {
            return;
        }

        try {
            await fs.mkdir(this.config.outputDir, { recursive: true });
            console.log(`📁 Debug output directory: ${this.config.outputDir}`);
        } catch (error) {
            console.warn(`⚠️ Output directory creation error: ${(error as Error).message}`);
        }
    }

    /**
     * Save EXPLAIN ANALYZE results
     * @param analyzeResult - EXPLAIN ANALYZE result
     * @param queryName - Query name
     * @returns Saved file path
     */
    async saveExplainAnalyze(analyzeResult: ExplainAnalyzeResult, queryName: string = 'query'): Promise<string | null> {
        if (!this.config.enableDebugOutput || !analyzeResult) {
            return null;
        }

        try {
            this.fileCounter.explainAnalyze++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const fileName = `explain-analyze_${this.sanitizeFileName(queryName)}_${this.fileCounter.explainAnalyze}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    queryName,
                    type: 'EXPLAIN_ANALYZE',
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.explainAnalyze
                },
                result: analyzeResult
            };

            await this.writeJsonFile(filePath, output);

            // Save the text format tree as well
            if (analyzeResult.tree) {
                const treeFileName = `explain-analyze_${this.sanitizeFileName(queryName)}_${this.fileCounter.explainAnalyze}${timestamp}.txt`;
                const treeFilePath = path.join(this.config.outputDir, treeFileName);
                await fs.writeFile(treeFilePath, analyzeResult.tree, 'utf8');
            }

            console.log(`💾 EXPLAIN ANALYZE saved: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ EXPLAIN ANALYZE save error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Save Optimizer Trace results
     * @param traceResult - Optimizer Trace result
     * @param queryName - Query name
     * @returns Saved file path
     */
    async saveOptimizerTrace(traceResult: OptimizerTraceInput, queryName: string = 'query'): Promise<string | null> {
        if (!this.config.enableDebugOutput || !traceResult) {
            return null;
        }

        try {
            this.fileCounter.optimizerTrace++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const fileName = `optimizer-trace_${this.sanitizeFileName(queryName)}_${this.fileCounter.optimizerTrace}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    queryName,
                    type: 'OPTIMIZER_TRACE',
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.optimizerTrace
                },
                trace: traceResult.trace,
                timestamp: traceResult.timestamp
            };

            await this.writeJsonFile(filePath, output);
            console.log(`💾 Optimizer Trace saved: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ Optimizer Trace save error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Save query plan (EXPLAIN) results
     * @param planResult - EXPLAIN result
     * @param queryName - Query name
     * @returns Saved file path
     */
    async saveQueryPlan(planResult: Record<string, unknown>, queryName: string = 'query'): Promise<string | null> {
        if (!this.config.enableDebugOutput || !planResult) {
            return null;
        }

        try {
            this.fileCounter.queryPlan++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const fileName = `query-plan_${this.sanitizeFileName(queryName)}_${this.fileCounter.queryPlan}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    queryName,
                    type: 'QUERY_PLAN',
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.queryPlan
                },
                plan: planResult
            };

            await this.writeJsonFile(filePath, output);
            console.log(`💾 Query plan saved: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ Query plan save error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Save general debug information
     * @param data - Data to save
     * @param name - File name
     * @param category - Category (optional)
     * @returns Saved file path
     */
    async saveDebugInfo(data: unknown, name: string = 'debug', category: string | null = null): Promise<string | null> {
        if (!this.config.enableDebugOutput) {
            return null;
        }

        try {
            this.fileCounter.general++;
            const timestamp = this.config.enableTimestamp ? this.getTimestamp() : '';
            const categoryPrefix = category ? `${category}_` : '';
            const fileName = `${categoryPrefix}${this.sanitizeFileName(name)}_${this.fileCounter.general}${timestamp}.json`;
            const filePath = path.join(this.config.outputDir, fileName);

            const output = {
                metadata: {
                    name,
                    category,
                    generatedAt: new Date().toISOString(),
                    counter: this.fileCounter.general
                },
                data
            };

            await this.writeJsonFile(filePath, output);
            console.log(`💾 Debug info saved: ${fileName}`);
            return filePath;
        } catch (error) {
            console.warn(`⚠️ Debug info save error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Save batch debug information
     * @param batchData - Batch data containing explainAnalyze, optimizerTrace, queryPlan, custom
     * @param queryName - Query name
     * @returns Map of saved file paths
     */
    async saveBatch(batchData: BatchData, queryName: string = 'query'): Promise<BatchResult> {
        if (!this.config.enableDebugOutput) {
            return {};
        }

        const results: BatchResult = {};

        if (batchData.explainAnalyze) {
            results.explainAnalyze = await this.saveExplainAnalyze(batchData.explainAnalyze, queryName);
        }

        if (batchData.optimizerTrace) {
            results.optimizerTrace = await this.saveOptimizerTrace(batchData.optimizerTrace, queryName);
        }

        if (batchData.queryPlan) {
            results.queryPlan = await this.saveQueryPlan(batchData.queryPlan, queryName);
        }

        if (batchData.custom) {
            const customResults: Record<string, string | null> = {};
            for (const [key, value] of Object.entries(batchData.custom)) {
                customResults[key] = await this.saveDebugInfo(value, `${queryName}_${key}`, 'custom');
            }
            results.custom = customResults;
        }

        return results;
    }

    /**
     * Write a JSON file
     * @param filePath - File path
     * @param data - Data to write
     */
    async writeJsonFile(filePath: string, data: unknown): Promise<void> {
        const jsonString = JSON.stringify(data, null, 2);

        // File size check
        if (Buffer.byteLength(jsonString, 'utf8') > this.config.maxFileSize) {
            console.warn(`⚠️ File size exceeds limit: ${filePath}`);
            // Save a compact version when oversized
            const compactString = JSON.stringify(data);
            await fs.writeFile(filePath, compactString, 'utf8');
        } else {
            await fs.writeFile(filePath, jsonString, 'utf8');
        }
    }

    /**
     * Generate a timestamp string
     * @returns Timestamp string
     */
    getTimestamp(): string {
        const now = new Date();
        return `_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    }

    /**
     * Sanitize a file name
     * @param name - File name
     * @returns Sanitized file name
     */
    sanitizeFileName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_{2,}/g, '_')
            .substring(0, 100);
    }

    /**
     * Cleanup old files in the output directory
     * @param maxAge - Maximum retention days (default 7)
     */
    async cleanup(maxAge: number = 7): Promise<void> {
        if (!this.config.enableDebugOutput) {
            return;
        }

        try {
            const files = await fs.readdir(this.config.outputDir);
            const now = Date.now();
            const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.config.outputDir, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtimeMs > maxAgeMs) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🗑️ ${deletedCount} old file(s) deleted`);
            }
        } catch (error) {
            console.warn(`⚠️ Cleanup error: ${(error as Error).message}`);
        }
    }

    /**
     * Get summary information
     * @returns Summary info
     */
    getSummary(): FileManagerSummary {
        return {
            outputDir: this.config.outputDir,
            enabled: this.config.enableDebugOutput,
            counters: { ...this.fileCounter },
            totalFiles: Object.values(this.fileCounter).reduce((a, b) => a + b, 0)
        };
    }

    /**
     * Reset counters
     */
    resetCounters(): void {
        this.fileCounter = {
            explainAnalyze: 0,
            optimizerTrace: 0,
            queryPlan: 0,
            general: 0
        };
    }
}

export default FileManager;
