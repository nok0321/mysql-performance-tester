/**
 * Result Storage
 * Manages saving, loading, and listing of test results
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Escape a field value per RFC 4180.
 * Wraps in double-quotes if the value contains comma, double-quote, or newline.
 */
function csvEscapeField(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

/**
 * Parse a single CSV line respecting RFC 4180 quoting rules.
 */
function csvParseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current);
    return fields;
}

interface ResultStorageConfigInput {
    resultDirectory?: string;
    enableAutoSave?: boolean;
    format?: 'json' | 'csv';
    includeTimestamp?: boolean;
    [key: string]: unknown;
}

interface ResultStorageConfig {
    resultDirectory: string;
    enableAutoSave: boolean;
    format: 'json' | 'csv';
    includeTimestamp: boolean;
    [key: string]: unknown;
}

interface ResultMetadata {
    savedAt: string;
    version: string;
    count: number;
}

interface StoredResult {
    metadata: ResultMetadata;
    results: Record<string, unknown>[];
}

interface CsvParsedResult {
    metadata: {
        format: string;
        count: number;
    };
    results: Record<string, string>[];
}

interface ListOptions {
    format?: string;
    limit?: number;
}

interface FileInfo {
    name: string;
    path: string;
    size: number;
    created: Date;
    modified: Date;
    isJson: boolean;
    isCsv: boolean;
}

interface StorageStats {
    totalFiles: number;
    totalSize: number;
    totalSizeMB: string;
    jsonFiles: number;
    csvFiles: number;
    oldestFile: FileInfo | null;
    newestFile: FileInfo | null;
}

export class ResultStorage {
    config: ResultStorageConfig;

    constructor(config: ResultStorageConfigInput = {}) {
        this.config = {
            resultDirectory: config.resultDirectory || './performance_results',
            enableAutoSave: config.enableAutoSave !== false,
            format: config.format || 'json',
            includeTimestamp: config.includeTimestamp !== false,
            ...config
        };
    }

    /**
     * Initialize the results directory
     */
    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.config.resultDirectory, { recursive: true });
            console.log(`📁 Result directory: ${this.config.resultDirectory}`);
        } catch (error) {
            console.warn(`⚠️ Result directory creation error: ${(error as Error).message}`);
        }
    }

    /**
     * Save test results
     * @param results - Test results (array or single object)
     * @param name - File name (optional)
     * @returns Saved file path
     */
    async save(results: Record<string, unknown>[] | Record<string, unknown>, name: string = 'results'): Promise<string | null> {
        if (!this.config.enableAutoSave) {
            return null;
        }

        try {
            // Create directory if it doesn't exist
            await fs.mkdir(this.config.resultDirectory, { recursive: true });

            const timestamp = this.config.includeTimestamp ? this.getTimestamp() : '';
            const sanitizedName = this.sanitizeFileName(name);
            const fileName = `${sanitizedName}${timestamp}.${this.config.format}`;
            const filePath = path.join(this.config.resultDirectory, fileName);

            // Save results in the configured format
            if (this.config.format === 'json') {
                await this.saveAsJson(filePath, results);
            } else if (this.config.format === 'csv') {
                await this.saveAsCsv(filePath, results);
            }

            console.log(`💾 Result saved: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error(`Failed to save result: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Save in JSON format
     * @param filePath - File path
     * @param results - Data to save
     */
    async saveAsJson(filePath: string, results: Record<string, unknown>[] | Record<string, unknown>): Promise<void> {
        const data = Array.isArray(results) ? results : [results];
        const output: StoredResult = {
            metadata: {
                savedAt: new Date().toISOString(),
                version: '2.0',
                count: data.length
            },
            results: data
        };

        await fs.writeFile(
            filePath,
            JSON.stringify(output, null, 2),
            'utf8'
        );
    }

    /**
     * Save in CSV format
     * @param filePath - File path
     * @param results - Data to save
     */
    async saveAsCsv(filePath: string, results: Record<string, unknown>[] | Record<string, unknown>): Promise<void> {
        const data = Array.isArray(results) ? results : [results];

        // CSV headers
        const headers = [
            'TestName',
            'Timestamp',
            'AvgDuration',
            'MinDuration',
            'MaxDuration',
            'P50',
            'P95',
            'P99',
            'Iterations',
            'SuccessRate'
        ];

        // CSV body
        const rows = data.map(result => {
            const stats = (result.statistics as Record<string, unknown>) || {};
            const basic = (stats.basic as Record<string, number>) || {};
            const percentiles = (stats.percentiles as Record<string, number>) || {};
            const count = (stats.count as Record<string, number>) || {};

            return [
                result.testName || '',
                result.timestamp || '',
                basic.mean || '',
                basic.min || '',
                basic.max || '',
                percentiles.p50 || '',
                percentiles.p95 || '',
                percentiles.p99 || '',
                count.total || '',
                count.total > 0 ? ((count.included / count.total) * 100).toFixed(2) : ''
            ].map(v => csvEscapeField(String(v))).join(',');
        });

        const csvContent = [headers.map(h => csvEscapeField(h)).join(','), ...rows].join('\n');
        await fs.writeFile(filePath, csvContent, 'utf8');
    }

    /**
     * Load results
     * @param fileName - File name (full path or relative path)
     * @returns Loaded results
     */
    async load(fileName: string): Promise<StoredResult | CsvParsedResult | null> {
        try {
            // Join with results directory if only a file name
            const filePath = path.isAbsolute(fileName)
                ? fileName
                : path.join(this.config.resultDirectory, fileName);

            const content = await fs.readFile(filePath, 'utf8');

            if (fileName.endsWith('.json')) {
                return JSON.parse(content) as StoredResult;
            } else if (fileName.endsWith('.csv')) {
                return this.parseCsv(content);
            }

            return null;
        } catch (error) {
            console.error(`Failed to load result: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Parse CSV content
     * @param content - CSV content
     * @returns Parsed data
     */
    parseCsv(content: string): CsvParsedResult {
        const lines = content.split('\n');
        const headers = csvParseLine(lines[0]);
        const results: Record<string, string>[] = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = csvParseLine(lines[i]);
            const result: Record<string, string> = {};

            headers.forEach((header, index) => {
                result[header] = values[index] ?? '';
            });

            results.push(result);
        }

        return {
            metadata: {
                format: 'csv',
                count: results.length
            },
            results
        };
    }

    /**
     * List saved results
     * @param options - Filter options
     * @returns Array of file information
     */
    async list(options: ListOptions = {}): Promise<FileInfo[]> {
        try {
            const files = await fs.readdir(this.config.resultDirectory);

            const fileInfos: FileInfo[] = await Promise.all(
                files
                    .filter(file => {
                        // Format filter
                        if (options.format) {
                            return file.endsWith(`.${options.format}`);
                        }
                        return file.endsWith('.json') || file.endsWith('.csv');
                    })
                    .map(async file => {
                        const filePath = path.join(this.config.resultDirectory, file);
                        const stats = await fs.stat(filePath);

                        return {
                            name: file,
                            path: filePath,
                            size: stats.size,
                            created: stats.birthtime,
                            modified: stats.mtime,
                            isJson: file.endsWith('.json'),
                            isCsv: file.endsWith('.csv')
                        };
                    })
            );

            // Sort (newest first)
            fileInfos.sort((a, b) => b.modified.getTime() - a.modified.getTime());

            // Limit count
            if (options.limit) {
                return fileInfos.slice(0, options.limit);
            }

            return fileInfos;
        } catch (error) {
            console.error(`Failed to list files: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Delete old result files
     * @param maxAge - Maximum retention days
     * @returns Number of deleted files
     */
    async cleanup(maxAge: number = 30): Promise<number> {
        try {
            const files = await fs.readdir(this.config.resultDirectory);
            const now = Date.now();
            const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.config.resultDirectory, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtimeMs > maxAgeMs) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🗑️ ${deletedCount} old result file(s) deleted`);
            }

            return deletedCount;
        } catch (error) {
            console.warn(`⚠️ Cleanup error: ${(error as Error).message}`);
            return 0;
        }
    }

    /**
     * Delete a specific file
     * @param fileName - File name
     * @returns Whether deletion succeeded
     */
    async delete(fileName: string): Promise<boolean> {
        try {
            const filePath = path.isAbsolute(fileName)
                ? fileName
                : path.join(this.config.resultDirectory, fileName);

            await fs.unlink(filePath);
            console.log(`🗑️ File deleted: ${fileName}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete file: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Merge and save results
     * @param fileNames - Array of file names to merge
     * @param outputName - Output file name
     * @returns Saved file path
     */
    async merge(fileNames: string[], outputName: string = 'merged_results'): Promise<string | null> {
        try {
            const allResults: Record<string, unknown>[] = [];

            for (const fileName of fileNames) {
                const data = await this.load(fileName);
                if (data && data.results) {
                    allResults.push(...(data.results as Record<string, unknown>[]));
                }
            }

            if (allResults.length === 0) {
                console.warn('No results to merge');
                return null;
            }

            return await this.save(allResults, outputName);
        } catch (error) {
            console.error(`Failed to merge results: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Generate a timestamp string
     * @returns Timestamp string
     */
    getTimestamp(): string {
        const now = new Date();
        return `_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
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
     * Get storage statistics
     * @returns Storage statistics
     */
    async getStats(): Promise<StorageStats | null> {
        try {
            const files = await this.list();
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);

            return {
                totalFiles: files.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                jsonFiles: files.filter(f => f.isJson).length,
                csvFiles: files.filter(f => f.isCsv).length,
                oldestFile: files.length > 0 ? files[files.length - 1] : null,
                newestFile: files.length > 0 ? files[0] : null
            };
        } catch (error) {
            console.error(`Failed to get statistics: ${(error as Error).message}`);
            return null;
        }
    }
}

export default ResultStorage;
