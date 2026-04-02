/**
 * Core - Core functionality layer
 *
 * Provides database connection, query execution, and other core features
 */

export { DatabaseConnection } from './database-connection.js';
export { QueryExecutor } from './query-executor.js';

export type { PoolStatus } from './database-connection.js';
export type {
    TimedQueryResult,
    BatchResult,
    BatchOptions,
    MultipleOptions,
    ExecutionStatistics,
    ExecutionPlanResult,
} from './query-executor.js';
