import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import { PerformanceSchemaAnalyzer } from '../../../lib/analyzers/performance-schema-analyzer.js';
import {
    createTestConnection,
    createIntegrationTestConfig,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';

describe('PerformanceSchemaAnalyzer (integration)', () => {
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

    describe('collectMetrics() with Performance Schema enabled', () => {
        it('should return metrics with expected structure', async () => {
            const config = createIntegrationTestConfig({ enablePerformanceSchema: true });
            const analyzer = new PerformanceSchemaAnalyzer(db, config);

            const metrics = await analyzer.collectMetrics();
            expect(metrics).not.toBeNull();

            // Verify structure - values are non-deterministic
            expect(metrics).toHaveProperty('bufferPool');
            expect(metrics).toHaveProperty('topQueries');
            expect(metrics).toHaveProperty('waitEvents');
            expect(metrics).toHaveProperty('tableScans');
            expect(metrics).toHaveProperty('connections');
        });
    });

    describe('collectMetrics() with Performance Schema disabled', () => {
        it('should return null', async () => {
            const config = createIntegrationTestConfig({ enablePerformanceSchema: false });
            const analyzer = new PerformanceSchemaAnalyzer(db, config);

            const metrics = await analyzer.collectMetrics();
            expect(metrics).toBeNull();
        });
    });
});
