import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../web/app.js';
import { initDb, closeDb } from '../../../web/store/database.js';

describe('SQL Library Routes', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-minimum-32chars!!';
        initDb(':memory:');
        app = createApp();
    });

    afterEach(() => {
        closeDb();
    });

    describe('GET /api/sql', () => {
        it('returns empty list initially', async () => {
            const res = await request(app).get('/api/sql');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
        });

        it('filters by category', async () => {
            await request(app).post('/api/sql').send({
                sql: 'SELECT 1', category: 'test',
            });
            await request(app).post('/api/sql').send({
                sql: 'SELECT 2', category: 'other',
            });

            const res = await request(app).get('/api/sql?category=test');
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].category).toBe('test');
        });

        it('filters by keyword', async () => {
            await request(app).post('/api/sql').send({
                sql: 'SELECT * FROM users', name: 'User Query',
            });
            await request(app).post('/api/sql').send({
                sql: 'SELECT * FROM orders', name: 'Order Query',
            });

            const res = await request(app).get('/api/sql?keyword=User');
            expect(res.body.data).toHaveLength(1);
        });
    });

    describe('GET /api/sql/categories', () => {
        it('returns distinct categories', async () => {
            await request(app).post('/api/sql').send({ sql: 'SELECT 1', category: 'perf' });
            await request(app).post('/api/sql').send({ sql: 'SELECT 2', category: 'debug' });
            await request(app).post('/api/sql').send({ sql: 'SELECT 3', category: 'perf' });

            const res = await request(app).get('/api/sql/categories');
            expect(res.status).toBe(200);
            expect(res.body.data).toContain('perf');
            expect(res.body.data).toContain('debug');
        });
    });

    describe('GET /api/sql/:id', () => {
        it('returns a specific SQL snippet', async () => {
            const created = await request(app).post('/api/sql').send({
                sql: 'SELECT NOW()', name: 'Time Check',
            });
            const id = created.body.data.id;

            const res = await request(app).get(`/api/sql/${id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.sql).toBe('SELECT NOW()');
            expect(res.body.data.name).toBe('Time Check');
        });

        it('returns 404 for non-existent ID', async () => {
            const res = await request(app).get('/api/sql/sql_nonexistent');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/sql', () => {
        it('creates a SQL snippet', async () => {
            const res = await request(app).post('/api/sql').send({
                sql: 'SELECT 1', name: 'Test', category: 'unit',
            });
            expect(res.status).toBe(201);
            expect(res.body.data.id).toBeDefined();
            expect(res.body.data.sql).toBe('SELECT 1');
        });

        it('returns 400 when sql is missing', async () => {
            const res = await request(app).post('/api/sql').send({ name: 'Empty' });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns 400 when sql is empty string', async () => {
            const res = await request(app).post('/api/sql').send({ sql: '   ' });
            expect(res.status).toBe(400);
        });

        it('returns 400 when sql exceeds size limit', async () => {
            const res = await request(app).post('/api/sql').send({
                sql: 'X'.repeat(100_001),
            });
            expect(res.status).toBe(400);
        });
    });

    describe('PUT /api/sql/:id', () => {
        it('updates an existing snippet', async () => {
            const created = await request(app).post('/api/sql').send({
                sql: 'SELECT 1', name: 'Original',
            });
            const id = created.body.data.id;

            const res = await request(app).put(`/api/sql/${id}`).send({
                name: 'Updated',
            });
            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Updated');
        });

        it('returns 404 for non-existent ID', async () => {
            const res = await request(app).put('/api/sql/sql_nonexistent').send({
                name: 'Foo',
            });
            expect(res.status).toBe(404);
        });

        it('returns 400 when updated sql exceeds size limit', async () => {
            const created = await request(app).post('/api/sql').send({
                sql: 'SELECT 1',
            });
            const id = created.body.data.id;

            const res = await request(app).put(`/api/sql/${id}`).send({
                sql: 'X'.repeat(100_001),
            });
            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /api/sql/:id', () => {
        it('deletes an existing snippet', async () => {
            const created = await request(app).post('/api/sql').send({
                sql: 'SELECT 1',
            });
            const id = created.body.data.id;

            const res = await request(app).delete(`/api/sql/${id}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('returns 404 for non-existent ID', async () => {
            const res = await request(app).delete('/api/sql/sql_nonexistent');
            expect(res.status).toBe(404);
        });
    });
});
