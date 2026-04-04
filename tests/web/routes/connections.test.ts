import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../web/app.js';
import { initDb, closeDb } from '../../../web/store/database.js';

describe('Connections Routes', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-minimum-32chars!!';
        initDb(':memory:');
        app = createApp();
    });

    afterEach(() => {
        closeDb();
    });

    describe('GET /api/connections', () => {
        it('returns empty list initially', async () => {
            const res = await request(app).get('/api/connections');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
        });

        it('returns created connections', async () => {
            await request(app).post('/api/connections').send({
                host: 'localhost', database: 'testdb', user: 'root',
            });

            const res = await request(app).get('/api/connections');
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].host).toBe('localhost');
        });
    });

    describe('POST /api/connections', () => {
        it('creates a connection with required fields', async () => {
            const res = await request(app).post('/api/connections').send({
                host: '192.168.1.1', database: 'mydb', user: 'admin',
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.host).toBe('192.168.1.1');
            expect(res.body.data.database).toBe('mydb');
            expect(res.body.data.id).toMatch(/^conn_/);
        });

        it('returns 400 when host is missing', async () => {
            const res = await request(app).post('/api/connections').send({
                database: 'mydb', user: 'root',
            });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns 400 when database is missing', async () => {
            const res = await request(app).post('/api/connections').send({
                host: 'localhost', user: 'root',
            });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns 400 when user is missing', async () => {
            const res = await request(app).post('/api/connections').send({
                host: 'localhost', database: 'mydb',
            });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('PUT /api/connections/:id', () => {
        it('updates an existing connection', async () => {
            const created = await request(app).post('/api/connections').send({
                host: 'localhost', database: 'testdb', user: 'root',
            });
            const id = created.body.data.id;

            const res = await request(app).put(`/api/connections/${id}`).send({
                name: 'Updated Name',
            });
            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Updated Name');
        });

        it('returns 404 for non-existent connection', async () => {
            const res = await request(app).put('/api/connections/conn_nonexistent').send({
                name: 'Foo',
            });
            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });
    });

    describe('DELETE /api/connections/:id', () => {
        it('deletes an existing connection', async () => {
            const created = await request(app).post('/api/connections').send({
                host: 'localhost', database: 'testdb', user: 'root',
            });
            const id = created.body.data.id;

            const res = await request(app).delete(`/api/connections/${id}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify deletion
            const list = await request(app).get('/api/connections');
            expect(list.body.data).toHaveLength(0);
        });

        it('returns 404 for non-existent connection', async () => {
            const res = await request(app).delete('/api/connections/conn_nonexistent');
            expect(res.status).toBe(404);
        });
    });
});
