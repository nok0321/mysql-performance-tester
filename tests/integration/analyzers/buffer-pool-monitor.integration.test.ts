import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import { BufferPoolMonitor } from '../../../lib/analyzers/buffer-pool-monitor.js';
import {
    createTestConnection,
    createIntegrationTestConfig,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';

describe('BufferPoolMonitor (integration)', () => {
    let db: DatabaseConnection;

    beforeAll(async () => {
        db = await createTestConnection();
    });

    afterAll(async () => {
        await teardownConnection(db);
    });

    describe('analyze() with buffer pool monitoring enabled', () => {
        it('should return buffer pool metrics', async () => {
            const config = createIntegrationTestConfig({ enableBufferPoolMonitoring: true });
            const monitor = new BufferPoolMonitor(db, config);

            const result = await monitor.analyze();
            expect(result).not.toBeNull();
            expect(result).toHaveProperty('metrics');
            expect(result).toHaveProperty('rawData');
            expect(typeof result!.timestamp).toBe('string');

            const { metrics } = result!;
            expect(typeof metrics.hitRatio).toBe('number');
            expect(metrics.pagesTotal).toBeGreaterThan(0);
        });
    });

    describe('analyze() with buffer pool monitoring disabled', () => {
        it('should return null', async () => {
            const config = createIntegrationTestConfig({ enableBufferPoolMonitoring: false });
            const monitor = new BufferPoolMonitor(db, config);

            const result = await monitor.analyze();
            expect(result).toBeNull();
        });
    });
});
