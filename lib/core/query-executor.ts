/**
 * QueryExecutor - Query execution management
 *
 * Handles SQL query execution and timing:
 * - Single query execution with timing
 * - Batch execution
 * - Error handling
 */

import { performance } from 'perf_hooks';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnection } from './database-connection.js';

/** Result of a timed query execution */
export interface TimedQueryResult {
    success: boolean;
    duration: number;
    rowCount?: number;
    error?: string;
    timestamp: string;
}

/** Result of a batch execution entry */
export interface BatchResult {
    index: number;
    query: string;
    result: TimedQueryResult | { success: true; rowCount: number } | null;
    error: string | null;
}

/** Options for batch execution */
export interface BatchOptions {
    stopOnError?: boolean;
    measureTiming?: boolean;
}

/** Options for multiple execution */
export interface MultipleOptions {
    onProgress?: (current: number, total: number, result: TimedQueryResult) => void;
}

/** Execution statistics */
export interface ExecutionStatistics {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    durations: {
        average: number;
        min: number;
        max: number;
        total: number;
    } | null;
}

/** Execution plan result */
export interface ExecutionPlanResult {
    type: string;
    format: string;
    data: unknown;
    timestamp: string;
}

/** EXPLAIN ANALYZE result */
export interface ExplainAnalyzeResult {
    type: string;
    tree: string;
    json: unknown;
    timestamp: string;
}

/**
 * Assert that a query contains only a single SQL statement.
 *
 * Even though multipleStatements:false is set on the pool, this provides
 * defense-in-depth for EXPLAIN calls. Semicolons inside quotes are ignored.
 *
 * @param query - SQL query to validate
 * @throws Error if multiple statements are detected
 */
function assertSingleStatement(query: string): void {
  // Strip quoted content before checking for semicolons
  const stripped = query
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")   // single-quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')   // double-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');  // backtick identifiers

  // If there's a semicolon before the trailing one, it's multiple statements
  const withoutTrailingSemicolon = stripped.trimEnd().replace(/;$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('EXPLAIN requires a single statement');
  }
}

export class QueryExecutor {
    private db: DatabaseConnection;

    /**
     * Initialize QueryExecutor
     * @param dbConnection - Database connection instance
     */
    constructor(dbConnection: DatabaseConnection) {
        this.db = dbConnection;
    }

    /**
     * Execute a query with timing measurement
     * @param query - SQL query
     * @returns Execution result with timing
     */
    async executeWithTiming(query: string): Promise<TimedQueryResult> {
        const startTime = performance.now();

        try {
            const [rows] = await this.db.execute(query);
            const duration = performance.now() - startTime;

            return {
                success: true,
                duration: duration,
                rowCount: rows.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            const duration = performance.now() - startTime;

            return {
                success: false,
                duration: duration,
                error: (error as Error).message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Execute a query without timing
     * @param query - SQL query
     * @param params - Query parameters
     * @returns Result rows
     */
    async executeQuery(query: string, params: unknown[] = []): Promise<RowDataPacket[]> {
        try {
            const [rows] = await this.db.execute(query, params);
            return rows;
        } catch (error) {
            console.error(`Query execution error: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Execute multiple queries in batch
     * @param queries - Array of SQL queries
     * @param options - Batch execution options
     * @returns Array of batch results
     */
    async executeBatch(queries: string[], options: BatchOptions = {}): Promise<BatchResult[]> {
        const {
            stopOnError = false,
            measureTiming = true
        } = options;

        const results: BatchResult[] = [];

        for (let i = 0; i < queries.length; i++) {
            const query = queries[i];

            try {
                const result = measureTiming
                    ? await this.executeWithTiming(query)
                    : await this.executeQuery(query);

                results.push({
                    index: i,
                    query: query,
                    result: measureTiming
                        ? (result as TimedQueryResult)
                        : { success: true as const, rowCount: (result as RowDataPacket[]).length },
                    error: null
                });

                if (!measureTiming || !(result as TimedQueryResult).success) {
                    if (stopOnError) {
                        break;
                    }
                }
            } catch (error) {
                results.push({
                    index: i,
                    query: query,
                    result: null,
                    error: (error as Error).message
                });

                if (stopOnError) {
                    break;
                }
            }
        }

        return results;
    }

    /**
     * Execute a query multiple times to gather statistics
     * @param query - SQL query
     * @param iterations - Number of executions
     * @param options - Execution options
     * @returns Array of timed results
     */
    async executeMultiple(query: string, iterations: number, options: MultipleOptions = {}): Promise<TimedQueryResult[]> {
        const { onProgress } = options;
        const results: TimedQueryResult[] = [];

        for (let i = 0; i < iterations; i++) {
            const result = await this.executeWithTiming(query);
            results.push(result);

            if (onProgress && typeof onProgress === 'function') {
                onProgress(i + 1, iterations, result);
            }
        }

        return results;
    }

    /**
     * Execute queries within a transaction
     * @param callback - Function to execute within the transaction
     * @returns The callback's return value
     */
    async executeInTransaction<T>(callback: (connection: PoolConnection) => Promise<T>): Promise<T> {
        const connection = await this.db.getConnection();

        try {
            await connection.beginTransaction();

            const result = await callback(connection);

            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get the execution plan for a query
     * @param query - SQL query
     * @param format - Output format (JSON, TREE, TRADITIONAL)
     * @returns Execution plan, or null on failure
     */
    async getExecutionPlan(query: string, format: string = 'JSON'): Promise<ExecutionPlanResult | null> {
        try {
            assertSingleStatement(query);

            const explainQuery = format === 'JSON'
                ? `EXPLAIN FORMAT=JSON ${query}`
                : `EXPLAIN ${query}`;

            const [rows] = await this.db.query(explainQuery);

            if (format === 'JSON') {
                return {
                    type: 'EXPLAIN',
                    format: 'JSON',
                    data: JSON.parse(rows[0].EXPLAIN as string),
                    timestamp: new Date().toISOString()
                };
            }

            return {
                type: 'EXPLAIN',
                format: format,
                data: rows,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Failed to get execution plan: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Execute EXPLAIN ANALYZE (MySQL 8.0.18+)
     * @param query - SQL query
     * @returns EXPLAIN ANALYZE result, or null if unsupported/failed
     */
    async getExplainAnalyze(query: string): Promise<ExplainAnalyzeResult | null> {
        if (!this.db.isExplainAnalyzeSupported()) {
            console.warn('EXPLAIN ANALYZE is not supported on this MySQL version');
            return null;
        }

        try {
            assertSingleStatement(query);

            const [rows] = await this.db.query(`EXPLAIN ANALYZE ${query}`);

            // Also attempt JSON format.
            // SET @@explain_json_format_version is a session variable,
            // so SET and EXPLAIN must run on the same connection.
            let jsonResult: unknown = null;
            const conn = await this.db.getConnection();
            try {
                await conn.query('SET @@explain_json_format_version = 2');
                const [jsonRows] = await conn.query<RowDataPacket[]>(`EXPLAIN ANALYZE FORMAT=JSON ${query}`);
                jsonResult = JSON.parse(jsonRows[0]['EXPLAIN'] as string);
            } catch (_jsonError) {
                // JSON format may not be available -- ignore
            } finally {
                conn.release();
            }

            return {
                type: 'EXPLAIN_ANALYZE',
                tree: rows[0]['EXPLAIN'] as string,
                json: jsonResult,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`Failed to execute EXPLAIN ANALYZE: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Calculate execution statistics from results
     * @param results - Array of timed query results
     * @returns Aggregated statistics
     */
    getExecutionStatistics(results: TimedQueryResult[]): ExecutionStatistics {
        const successResults = results.filter(r => r.success);
        const failureResults = results.filter(r => !r.success);

        if (successResults.length === 0) {
            return {
                totalExecutions: results.length,
                successCount: 0,
                failureCount: failureResults.length,
                successRate: 0,
                durations: null
            };
        }

        const durations = successResults.map(r => r.duration);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);

        return {
            totalExecutions: results.length,
            successCount: successResults.length,
            failureCount: failureResults.length,
            successRate: (successResults.length / results.length) * 100,
            durations: {
                average: avg,
                min: min,
                max: max,
                total: sum
            }
        };
    }
}

export default QueryExecutor;
