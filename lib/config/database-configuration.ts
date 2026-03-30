/**
 * DB connection config factory
 *
 * createDbConfig() is the primary API.
 */

import type { DbConfig, DbConfigOptions, PoolConfig } from '../types/index.js';

/**
 * Create a plain DB connection config object
 */
export function createDbConfig(options: DbConfigOptions = {}): DbConfig {
  return {
    host:           options.host     || process.env.DB_HOST               || 'localhost',
    port:           Number(options.port) || parseInt(process.env.DB_PORT || '', 10) || 3306,
    user:           options.user     || process.env.DB_USER               || 'root',
    password:       options.password ?? process.env.DB_PASSWORD           ?? '',
    database:       options.database || process.env.DB_NAME               || 'database',
    connectTimeout: options.connectTimeout || 10000,
    acquireTimeout: options.acquireTimeout || 30000,
    timeout:        options.timeout        || 30000,
    parallelThreads: options.parallelThreads || 5,
  };
}

/**
 * Build a mysql2 createPool() config object
 */
export function buildPoolConfig(dbConfig: DbConfig): PoolConfig {
  const connLimit = Math.max(10, dbConfig.parallelThreads + 5);
  return {
    host:     dbConfig.host,
    port:     dbConfig.port,
    user:     dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,

    waitForConnections: true,
    connectionLimit:    connLimit,
    queueLimit:         0,

    maxIdle:     Math.ceil(connLimit / 2),
    idleTimeout: 60000,

    enableKeepAlive:      true,
    keepAliveInitialDelay: 0,

    connectTimeout: dbConfig.connectTimeout,
    acquireTimeout: dbConfig.acquireTimeout,

    multipleStatements: false,
  };
}

export default createDbConfig;
