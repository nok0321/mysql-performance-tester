/**
 * DatabaseConnection - Database connection management
 *
 * Provides MySQL connection pool management and database operations:
 * - Connection pool initialization
 * - Server capability detection (version, EXPLAIN ANALYZE support, etc.)
 * - Connection testing
 * - Query execution
 */

import mysql, { type Pool, type PoolConnection, type PoolOptions, type RowDataPacket, type FieldPacket } from 'mysql2/promise';
import { buildPoolConfig } from '../config/database-configuration.js';
import type { DbConfig } from '../types/index.js';

/** Shape returned by getPoolStatus() */
export interface PoolStatus {
    connectionLimit: number | null;
}

export class DatabaseConnection {
    private config: DbConfig;
    private pool: Pool | null;
    private serverVersion: string | null;
    private supportsExplainAnalyze: boolean;

    /**
     * Initialize database connection
     * @param config - Database configuration
     */
    constructor(config: DbConfig) {
        this.config = config;
        this.pool = null;
        this.serverVersion = null;
        this.supportsExplainAnalyze = false;
    }

    /**
     * Initialize the connection pool and detect server capabilities
     * @returns This instance
     */
    async initialize(): Promise<DatabaseConnection> {
        this.pool = mysql.createPool(buildPoolConfig(this.config));
        await this.detectServerCapabilities();
        return this;
    }

    /**
     * Detect MySQL server version and capabilities
     */
    async detectServerCapabilities(): Promise<void> {
        try {
            const [rows] = await this.pool!.query<RowDataPacket[]>('SELECT VERSION() as version');
            this.serverVersion = rows[0].version as string;

            // MySQL 8.0.18+ supports EXPLAIN ANALYZE
            const versionMatch = this.serverVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
            if (versionMatch) {
                const [, major, minor, patch] = versionMatch.map(Number);
                this.supportsExplainAnalyze = (major > 8) ||
                    (major === 8 && minor > 0) ||
                    (major === 8 && minor === 0 && patch >= 18);
            }

            console.log(`MySQL Version: ${this.serverVersion}`);
            console.log(`EXPLAIN ANALYZE Support: ${this.supportsExplainAnalyze ? 'Yes' : 'No'}`);
        } catch (error) {
            console.warn('Failed to detect server capabilities:', (error as Error).message);
        }
    }

    /**
     * Test database connection with retries
     * @param maxRetries - Maximum retry attempts (default 3).
     *   Reduced from 10 to 3 so Web API calls complete within ~3 s timeout.
     *   For longer waits (e.g. Docker Compose startup), pass explicitly:
     *     db.testConnection(10, 2000)
     * @param retryDelayMs - Delay between retries in milliseconds (default 1000)
     * @returns true if connection succeeds
     */
    async testConnection(maxRetries: number = 3, retryDelayMs: number = 1000): Promise<boolean> {
        for (let i = 1; i <= maxRetries; i++) {
            try {
                const connection: PoolConnection = await this.pool!.getConnection();
                await connection.query('SELECT 1');
                connection.release();
                return true;
            } catch (error) {
                if (i === maxRetries) {
                    console.error(`Failed to connect to MySQL: ${(error as Error).message}`);
                    this.logConnectionErrors();
                    return false;
                }
                console.log(`Testing connection... (${i}/${maxRetries})`);
                await this.#sleep(retryDelayMs);
            }
        }
        return false;
    }

    /**
     * Output debug information on connection error
     */
    logConnectionErrors(): void {
        console.error(`
Connection Check:
1. Verify database connection information:
   - Host: ${this.config.host}:${this.config.port}
   - Database: ${this.config.database}
   - User: ${this.config.user}
2. Check if MySQL server is running
3. Check firewall or security group settings
        `);
    }

    /**
     * Get a connection from the pool
     * @returns A pool connection
     */
    async getConnection(): Promise<PoolConnection> {
        return await this.pool!.getConnection();
    }

    /**
     * Execute a query as a prepared statement
     * @param query - SQL query
     * @param params - Query parameters
     * @returns Query result rows and field metadata
     */
    async execute(query: string, params: unknown[] = []): Promise<[RowDataPacket[], FieldPacket[]]> {
        return await this.pool!.execute<RowDataPacket[]>(query, params);
    }

    /**
     * Execute a query
     * @param query - SQL query
     * @returns Query result rows and field metadata
     */
    async query(query: string): Promise<[RowDataPacket[], FieldPacket[]]> {
        return await this.pool!.query<RowDataPacket[]>(query);
    }

    /**
     * Close the connection pool
     */
    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
        }
    }

    /**
     * Sleep for the specified milliseconds (internal use only)
     * @param ms - Wait time in milliseconds
     */
    #sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get the server version
     * @returns Server version string, or null if not yet detected
     */
    getServerVersion(): string | null {
        return this.serverVersion;
    }

    /**
     * Check whether EXPLAIN ANALYZE is supported
     * @returns true if supported
     */
    isExplainAnalyzeSupported(): boolean {
        return this.supportsExplainAnalyze;
    }

    /**
     * Get connection pool status
     * @returns Pool status info, or null if pool is not initialized
     */
    /**
     * Get the underlying connection pool (for parallel execution).
     * Returns null if pool is not initialized.
     */
    getPool(): Pool | null {
        return this.pool;
    }

    getPoolStatus(): PoolStatus | null {
        if (!this.pool) {
            return null;
        }

        // mysql2 internal properties (_allConnections, etc.) are private API -- avoid using them.
        // connectionLimit is safely accessible from pool config.
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mysql2 Pool does not expose config in public types
            const poolAny = this.pool as Record<string, any>;
            const connectionLimit = poolAny.pool?.config?.connectionLimit ?? null;
            return { connectionLimit };
        } catch {
            return null;
        }
    }
}

export default DatabaseConnection;
