import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../web/app.js';
import { initDb, closeDb } from '../../../web/store/database.js';

describe('Tests Routes', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-minimum-32chars!!';
        initDb(':memory:');
        app = createApp();
    });

    afterEach(() => {
        closeDb();
    });

    describe('POST /api/tests/single', () => {
        it('returns 400 when sqlText is missing', async () => {
            const res = await request(app).post('/api/tests/single').send({
                connectionId: 'conn_test',
            });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns 400 when sqlText is empty', async () => {
            const res = await request(app).post('/api/tests/single').send({
                connectionId: 'conn_test',
                sqlText: '   ',
            });
            expect(res.status).toBe(400);
        });

        it('returns 400 for dangerous SQL (DROP TABLE)', async () => {
            const res = await request(app).post('/api/tests/single').send({
                connectionId: 'conn_test',
                sqlText: 'DROP TABLE users',
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('バリデーション');
        });
    });

    describe('POST /api/tests/comparison', () => {
        it('returns 400 when sqlTextA is missing', async () => {
            const res = await request(app).post('/api/tests/comparison').send({
                connectionId: 'conn_test',
                sqlTextB: 'SELECT 1',
            });
            expect(res.status).toBe(400);
        });

        it('returns 400 when sqlTextB is missing', async () => {
            const res = await request(app).post('/api/tests/comparison').send({
                connectionId: 'conn_test',
                sqlTextA: 'SELECT 1',
            });
            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/tests/results', () => {
        it('returns empty results list initially', async () => {
            const res = await request(app).get('/api/tests/results');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
            expect(res.body.pagination).toBeDefined();
        });

        it('supports pagination parameters', async () => {
            const res = await request(app).get('/api/tests/results?limit=5&offset=0');
            expect(res.status).toBe(200);
            expect(res.body.pagination.limit).toBe(5);
            expect(res.body.pagination.offset).toBe(0);
        });
    });

    describe('GET /api/tests/results/:id', () => {
        it('returns 404 for non-existent result', async () => {
            const res = await request(app).get('/api/tests/results/test_nonexistent');
            expect(res.status).toBe(404);
        });
    });
});
