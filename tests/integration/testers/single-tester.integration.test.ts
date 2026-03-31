import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySQLPerformanceTester } from '../../../lib/testers/single-tester.js';
import type { ProgressEvent } from '../../../lib/testers/single-tester.js';
import {
    createTestDbConfig,
    createTestConnection,
    createIntegrationTestConfig,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesSqlDir = resolve(__dirname, '../fixtures/sql');

describe('MySQLPerformanceTester (integration)', () => {
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

    describe('executeTest() without warmup', () => {
        it('should run a test and return TestResult with timing data', async () => {
            const dbConfig = createTestDbConfig();
            const testConfig = createIntegrationTestConfig({
                testIterations: 3,
                enableWarmup: false,
                enableExplainAnalyze: false,
                enablePerformanceSchema: false,
                enableOptimizerTrace: false,
                enableBufferPoolMonitoring: false,
                generateReport: false,
            });

            const tester = new MySQLPerformanceTester(dbConfig, testConfig);
            await tester.initialize();

            try {
                const result = await tester.executeTest(
                    'simple-select',
                    "SELECT * FROM users WHERE status = 'active' LIMIT 5",
                );

                expect(result).toBeDefined();
                expect(result.testName).toBe('simple-select');
                expect(result.query).toContain('SELECT');
                expect(result.rawDurations.length).toBe(3);
                for (const d of result.rawDurations) {
                    expect(d).toBeGreaterThan(0);
                }
            } finally {
                await tester.cleanup();
            }
        });

        it('should emit progress events during measurement', async () => {
            const dbConfig = createTestDbConfig();
            const testConfig = createIntegrationTestConfig({
                testIterations: 3,
                enableWarmup: false,
                enableExplainAnalyze: false,
                enablePerformanceSchema: false,
                enableOptimizerTrace: false,
                enableBufferPoolMonitoring: false,
                generateReport: false,
            });

            const tester = new MySQLPerformanceTester(dbConfig, testConfig);
            await tester.initialize();

            const events: ProgressEvent[] = [];
            tester.on('progress', (evt: ProgressEvent) => events.push(evt));

            try {
                await tester.executeTest('progress-test', 'SELECT COUNT(*) FROM users');
                expect(events.length).toBe(3);
                expect(events[0].phase).toBe('measuring');
                expect(events[0].current).toBe(1);
                expect(events[2].current).toBe(3);
            } finally {
                await tester.cleanup();
            }
        });
    });

    describe('executeTestWithWarmup()', () => {
        it('should emit warmup progress event before measuring', async () => {
            const dbConfig = createTestDbConfig();
            const testConfig = createIntegrationTestConfig({
                testIterations: 3,
                enableWarmup: true,
                warmupIterations: 2,
                enableExplainAnalyze: false,
                enablePerformanceSchema: false,
                enableOptimizerTrace: false,
                enableBufferPoolMonitoring: false,
                generateReport: false,
            });

            const tester = new MySQLPerformanceTester(dbConfig, testConfig);
            await tester.initialize();

            const phases: string[] = [];
            tester.on('progress', (evt: ProgressEvent) => phases.push(evt.phase));

            try {
                await tester.executeTestWithWarmup('warmup-test', 'SELECT 1');
                expect(phases).toContain('warmup');
                expect(phases).toContain('measuring');
                // Warmup event comes first
                expect(phases.indexOf('warmup')).toBeLessThan(phases.indexOf('measuring'));
            } finally {
                await tester.cleanup();
            }
        });
    });

    describe('getTestResults()', () => {
        it('should accumulate results across multiple tests', async () => {
            const dbConfig = createTestDbConfig();
            const testConfig = createIntegrationTestConfig({
                testIterations: 2,
                enableWarmup: false,
                enableExplainAnalyze: false,
                enablePerformanceSchema: false,
                enableOptimizerTrace: false,
                enableBufferPoolMonitoring: false,
                generateReport: false,
            });

            const tester = new MySQLPerformanceTester(dbConfig, testConfig);
            await tester.initialize();

            try {
                await tester.executeTest('test-1', 'SELECT 1');
                await tester.executeTest('test-2', 'SELECT 2');

                const results = tester.getTestResults();
                expect(results).toHaveLength(2);
                expect(results[0].testName).toBe('test-1');
                expect(results[1].testName).toBe('test-2');
            } finally {
                await tester.cleanup();
            }
        });
    });
});
