import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import { QueryExecutor } from '../../../lib/core/query-executor.js';
import {
    createTestConnection,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';
import { TEST_QUERIES } from '../helpers/test-queries.js';

describe('QueryExecutor (integration)', () => {
    let db: DatabaseConnection;
    let executor: QueryExecutor;

    beforeAll(async () => {
        db = await createTestConnection();
        executor = new QueryExecutor(db);
        await cleanupTestData(db);
        await seedTestData(db);
    });

    afterAll(async () => {
        await cleanupTestData(db);
        await teardownConnection(db);
    });

    describe('executeWithTiming()', () => {
        it('should return timing result for valid query', async () => {
            const result = await executor.executeWithTiming(TEST_QUERIES.simpleSelect);
            expect(result.success).toBe(true);
            expect(result.duration).toBeGreaterThan(0);
            expect(result.rowCount).toBeGreaterThanOrEqual(0);
            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
        });

        it('should return failure for invalid query', async () => {
            const result = await executor.executeWithTiming(TEST_QUERIES.invalidQuery);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.length).toBeGreaterThan(0);
        });
    });

    describe('executeQuery()', () => {
        it('should return rows for a SELECT', async () => {
            const rows = await executor.executeQuery(TEST_QUERIES.countQuery);
            expect(rows).toHaveLength(1);
            expect(Number(rows[0].cnt)).toBe(10);
        });
    });

    describe('executeBatch()', () => {
        it('should execute multiple queries', async () => {
            const results = await executor.executeBatch([
                TEST_QUERIES.countQuery,
                TEST_QUERIES.aggregateQuery,
            ]);
            expect(results).toHaveLength(2);
            for (const r of results) {
                expect(r.error).toBeNull();
            }
        });

        it('should stop on error when stopOnError is true', async () => {
            const results = await executor.executeBatch(
                [TEST_QUERIES.invalidQuery, TEST_QUERIES.countQuery],
                { stopOnError: true, measureTiming: false },
            );
            // First query fails and is caught, stopping execution
            expect(results[0].error).not.toBeNull();
            // Second query should not execute
            expect(results).toHaveLength(1);
        });
    });

    describe('executeMultiple()', () => {
        it('should execute query N times', async () => {
            const results = await executor.executeMultiple(TEST_QUERIES.countQuery, 5);
            expect(results).toHaveLength(5);
            for (const r of results) {
                expect(r.success).toBe(true);
                expect(r.duration).toBeGreaterThan(0);
            }
        });

        it('should call onProgress callback', async () => {
            const progressCalls: Array<{ current: number; total: number }> = [];
            await executor.executeMultiple(TEST_QUERIES.countQuery, 3, {
                onProgress: (current, total) => {
                    progressCalls.push({ current, total });
                },
            });
            expect(progressCalls).toHaveLength(3);
            expect(progressCalls[0]).toEqual({ current: 1, total: 3 });
            expect(progressCalls[2]).toEqual({ current: 3, total: 3 });
        });
    });

    describe('executeInTransaction()', () => {
        beforeEach(async () => {
            await cleanupTestData(db);
            await seedTestData(db);
        });

        it('should commit on success', async () => {
            await executor.executeInTransaction(async (conn) => {
                await conn.execute(
                    "INSERT INTO users (name, email, age, status, score) VALUES (?, ?, ?, ?, ?)",
                    ['Tx User', 'tx@example.com', 30, 'active', 0],
                );
            });

            const [rows] = await db.query("SELECT * FROM users WHERE email = 'tx@example.com'");
            expect(rows).toHaveLength(1);
        });

        it('should rollback on error', async () => {
            try {
                await executor.executeInTransaction(async (conn) => {
                    await conn.execute(
                        "INSERT INTO users (name, email, age, status, score) VALUES (?, ?, ?, ?, ?)",
                        ['Rollback User', 'rollback@example.com', 25, 'active', 0],
                    );
                    throw new Error('Intentional rollback');
                });
            } catch {
                // Expected
            }

            const [rows] = await db.query("SELECT * FROM users WHERE email = 'rollback@example.com'");
            expect(rows).toHaveLength(0);
        });
    });

    describe('getExecutionPlan()', () => {
        it('should return EXPLAIN JSON result', async () => {
            const plan = await executor.getExecutionPlan(TEST_QUERIES.simpleSelect);
            expect(plan).not.toBeNull();
            expect(plan!.type).toBe('EXPLAIN');
            expect(plan!.format).toBe('JSON');
            expect(plan!.data).toBeDefined();
        });
    });

    // NOTE: getExplainAnalyze() was removed from QueryExecutor.
    // EXPLAIN ANALYZE is now exclusively handled by ExplainAnalyzer.
    // See tests/integration/analyzers/explain-analyzer.integration.test.ts

    describe('getExecutionStatistics()', () => {
        it('should calculate statistics from results', async () => {
            const results = await executor.executeMultiple(TEST_QUERIES.countQuery, 5);
            const stats = executor.getExecutionStatistics(results);
            expect(stats.totalExecutions).toBe(5);
            expect(stats.successCount).toBe(5);
            expect(stats.failureCount).toBe(0);
            expect(stats.successRate).toBe(100);
            expect(stats.durations).not.toBeNull();
            expect(stats.durations!.average).toBeGreaterThan(0);
            expect(stats.durations!.min).toBeGreaterThan(0);
            expect(stats.durations!.max).toBeGreaterThanOrEqual(stats.durations!.min);
        });
    });
});
