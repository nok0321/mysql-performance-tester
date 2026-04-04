import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../web/app.js';
import { initDb, closeDb } from '../../../web/store/database.js';

describe('History Routes', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-minimum-32chars!!';
        initDb(':memory:');
        app = createApp();
    });

    afterEach(() => {
        closeDb();
    });

    describe('GET /api/history/fingerprints', () => {
        it('returns empty fingerprints list initially', async () => {
            const res = await request(app).get('/api/history/fingerprints');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
            expect(res.body.pagination).toBeDefined();
        });

        it('supports pagination', async () => {
            const res = await request(app).get('/api/history/fingerprints?limit=5&offset=0');
            expect(res.status).toBe(200);
            expect(res.body.pagination.limit).toBe(5);
        });
    });

    describe('GET /api/history/:fingerprint', () => {
        it('returns 400 for invalid fingerprint format', async () => {
            const res = await request(app).get('/api/history/invalid-fp');
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('returns empty entries for valid but non-existent fingerprint', async () => {
            const res = await request(app).get('/api/history/0123456789abcdef');
            expect(res.status).toBe(200);
            expect(res.body.data.entries).toEqual([]);
        });
    });

    describe('GET /api/history/:fingerprint/compare', () => {
        it('returns 400 when before is missing', async () => {
            const res = await request(app).get('/api/history/0123456789abcdef/compare?after=test_b');
            expect(res.status).toBe(400);
        });

        it('returns 400 when after is missing', async () => {
            const res = await request(app).get('/api/history/0123456789abcdef/compare?before=test_a');
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/history/events', () => {
        it('creates a timeline event', async () => {
            const res = await request(app).post('/api/history/events').send({
                queryFingerprint: '0123456789abcdef',
                label: 'Added index on users.email',
                type: 'index_added',
            });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.id).toBeDefined();
            expect(res.body.data.label).toBe('Added index on users.email');
        });

        it('returns 400 when queryFingerprint is missing', async () => {
            const res = await request(app).post('/api/history/events').send({
                label: 'Test', type: 'custom',
            });
            expect(res.status).toBe(400);
        });

        it('returns 400 when label is missing', async () => {
            const res = await request(app).post('/api/history/events').send({
                queryFingerprint: '0123456789abcdef', type: 'custom',
            });
            expect(res.status).toBe(400);
        });

        it('returns 400 when type is missing', async () => {
            const res = await request(app).post('/api/history/events').send({
                queryFingerprint: '0123456789abcdef', label: 'Test',
            });
            expect(res.status).toBe(400);
        });

        it('returns 400 for invalid event type', async () => {
            const res = await request(app).post('/api/history/events').send({
                queryFingerprint: '0123456789abcdef',
                label: 'Test',
                type: 'invalid_type',
            });
            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /api/history/events/:id', () => {
        it('deletes an existing event', async () => {
            const created = await request(app).post('/api/history/events').send({
                queryFingerprint: '0123456789abcdef',
                label: 'To be deleted',
                type: 'custom',
            });
            const id = created.body.data.id;

            const res = await request(app).delete(`/api/history/events/${id}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('returns 404 for non-existent event', async () => {
            const res = await request(app).delete('/api/history/events/evt_nonexistent');
            expect(res.status).toBe(404);
        });
    });
});
