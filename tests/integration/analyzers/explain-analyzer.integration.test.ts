import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import { ExplainAnalyzer } from '../../../lib/analyzers/explain-analyzer.js';
import {
    createTestConnection,
    createIntegrationTestConfig,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';
import { TEST_QUERIES } from '../helpers/test-queries.js';

describe('ExplainAnalyzer (integration)', () => {
    let db: DatabaseConnection;
    let analyzer: ExplainAnalyzer;

    beforeAll(async () => {
        db = await createTestConnection();
        const config = createIntegrationTestConfig({ enableExplainAnalyze: true });
        analyzer = new ExplainAnalyzer(db, config);
        await cleanupTestData(db);
        await seedTestData(db);
    });

    afterAll(async () => {
        await cleanupTestData(db);
        await teardownConnection(db);
    });

    describe('analyzeQuery()', () => {
        it('should return EXPLAIN JSON for a valid query', async () => {
            const result = await analyzer.analyzeQuery(TEST_QUERIES.simpleSelect);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('EXPLAIN');
            expect(result!.data).toBeDefined();
            expect(typeof result!.timestamp).toBe('string');
        });

        it('should return null for an invalid query', async () => {
            const result = await analyzer.analyzeQuery(TEST_QUERIES.invalidQuery);
            expect(result).toBeNull();
        });
    });

    describe('analyzeQueryWithExecution()', () => {
        it('should return EXPLAIN ANALYZE result', async () => {
            const result = await analyzer.analyzeQueryWithExecution(TEST_QUERIES.simpleSelect);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('EXPLAIN_ANALYZE');
            expect(typeof result!.tree).toBe('string');
            expect(result!.tree.length).toBeGreaterThan(0);
        });
    });
});
