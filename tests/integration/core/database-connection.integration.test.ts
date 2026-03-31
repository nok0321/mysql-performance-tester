import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import {
    createTestDbConfig,
    createTestConnection,
    seedTestData,
    cleanupTestData,
    teardownConnection,
} from '../helpers/db-setup.js';

describe('DatabaseConnection (integration)', () => {
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

    describe('initialize()', () => {
        it('should detect server version', () => {
            const version = db.getServerVersion();
            expect(version).toMatch(/^\d+\.\d+\.\d+/);
        });

        it('should detect EXPLAIN ANALYZE support on MySQL 8.0', () => {
            expect(db.isExplainAnalyzeSupported()).toBe(true);
        });
    });

    describe('testConnection()', () => {
        it('should return true for valid connection', async () => {
            const result = await db.testConnection(1, 500);
            expect(result).toBe(true);
        });

        it('should return false for unreachable host', async () => {
            const badConfig = createTestDbConfig();
            badConfig.host = '192.0.2.1'; // RFC 5737 TEST-NET
            badConfig.connectTimeout = 1000;
            const badDb = new DatabaseConnection(badConfig);
            await badDb.initialize();
            const result = await badDb.testConnection(1, 500);
            expect(result).toBe(false);
            await badDb.close().catch(() => {});
        });
    });

    describe('getConnection()', () => {
        it('should return a pool connection that can be released', async () => {
            const conn = await db.getConnection();
            expect(conn).toBeDefined();
            expect(typeof conn.release).toBe('function');
            conn.release();
        });
    });

    describe('execute()', () => {
        it('should execute parameterized queries', async () => {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [1]);
            expect(rows).toHaveLength(1);
            expect(rows[0]).toHaveProperty('name', 'User 1');
        });
    });

    describe('query()', () => {
        it('should execute plain SQL', async () => {
            const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM users');
            expect(Number(rows[0].cnt)).toBe(10);
        });
    });

    describe('getPoolStatus()', () => {
        it('should return pool status with connectionLimit', () => {
            const status = db.getPoolStatus();
            expect(status).not.toBeNull();
            expect(typeof status!.connectionLimit).toBe('number');
        });
    });

    describe('close()', () => {
        it('should close the pool without error', async () => {
            const tempDb = await createTestConnection();
            await expect(tempDb.close()).resolves.not.toThrow();
        });
    });
});
