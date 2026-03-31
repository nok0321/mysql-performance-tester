import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ParallelPerformanceTester } from '../../../lib/testers/parallel-tester.js';
import {
    createTestDbConfig,
    createTestConnection,
    createIntegrationTestConfig,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';

describe('ParallelPerformanceTester (integration)', () => {
    let seedDb: Awaited<ReturnType<typeof createTestConnection>>;

    beforeAll(async () => {
        seedDb = await createTestConnection();
        await cleanupTestData(seedDb);
        await seedTestData(seedDb);
    });

    afterAll(async () => {
        await cleanupTestData(seedDb);
        await teardownConnection(seedDb);
    });

    describe('executeParallelTests()', () => {
        it('should execute a single query in parallel and return metrics', async () => {
            const dbConfig = createTestDbConfig();
            const testConfig = createIntegrationTestConfig({
                parallelThreads: 2,
                testIterations: 3,
            });

            const tester = new ParallelPerformanceTester(dbConfig, testConfig);
            await tester.initialize();

            try {
                const result = await tester.executeParallelTests(
                    'parallel-count',
                    'SELECT COUNT(*) FROM users',
                );

                expect(result).toBeDefined();
                expect(result.strategy).toBe('Promise.all');
                expect(result.metrics).toBeDefined();
                expect(result.metrics.queries.total).toBeGreaterThan(0);
                expect(result.metrics.queries.completed).toBeGreaterThan(0);
                expect(result.metrics.duration.total).toBeGreaterThan(0);
            } finally {
                await tester.cleanup();
            }
        });
    });

    describe('executeParallelQuery()', () => {
        it('should return ConcurrentLoadMetrics', async () => {
            const dbConfig = createTestDbConfig();
            const testConfig = createIntegrationTestConfig({
                parallelThreads: 2,
                testIterations: 2,
            });

            const tester = new ParallelPerformanceTester(dbConfig, testConfig);
            await tester.initialize();

            try {
                const metrics = await tester.executeParallelQuery(
                    'SELECT 1',
                    2, // threads
                    2, // iterations per thread
                );

                expect(metrics).toBeDefined();
                const json = metrics.toJSON();
                expect(json.queries.total).toBe(4); // 2 threads * 2 iterations
                expect(json.queries.completed).toBe(4);
                expect(json.duration.total).toBeGreaterThan(0);
            } finally {
                await tester.cleanup();
            }
        });
    });
});
