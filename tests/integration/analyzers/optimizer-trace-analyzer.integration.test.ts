import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import { OptimizerTraceAnalyzer } from '../../../lib/analyzers/optimizer-trace-analyzer.js';
import {
    createTestConnection,
    createIntegrationTestConfig,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';
import { TEST_QUERIES } from '../helpers/test-queries.js';

describe('OptimizerTraceAnalyzer (integration)', () => {
    let db: DatabaseConnection;

    beforeAll(async () => {
        db = await createTestConnection();
        await cleanupTestData(db);
        await seedTestData(db);
    });

    afterAll(async () => {
        await cleanupTestData(db);
        await teardownConnection(db);
    });

    describe('captureTrace() with optimizer trace enabled', () => {
        it('should return trace result with steps', async () => {
            const config = createIntegrationTestConfig({ enableOptimizerTrace: true });
            const analyzer = new OptimizerTraceAnalyzer(db, config);

            const result = await analyzer.captureTrace(TEST_QUERIES.simpleSelect);
            expect(result).not.toBeNull();
            expect(result).toHaveProperty('trace');
            expect(typeof result!.timestamp).toBe('string');
        });
    });

    describe('captureTrace() with optimizer trace disabled', () => {
        it('should return null', async () => {
            const config = createIntegrationTestConfig({ enableOptimizerTrace: false });
            const analyzer = new OptimizerTraceAnalyzer(db, config);

            const result = await analyzer.captureTrace(TEST_QUERIES.simpleSelect);
            expect(result).toBeNull();
        });
    });
});
