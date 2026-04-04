import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../web/app.js';
import { initDb, closeDb } from '../../../web/store/database.js';

describe('Health & WebSocket Token Routes', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-minimum-32chars!!';
        initDb(':memory:');
        app = createApp();
    });

    afterEach(() => {
        closeDb();
    });

    describe('GET /api/health', () => {
        it('returns health status', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.timestamp).toBeDefined();
            expect(res.body.wsClients).toBe(0);
        });
    });

    describe('GET /api/ws-token', () => {
        it('returns a token', async () => {
            const res = await request(app).get('/api/ws-token');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(typeof res.body.token).toBe('string');
        });

        it('returns unique tokens on each request', async () => {
            const res1 = await request(app).get('/api/ws-token');
            const res2 = await request(app).get('/api/ws-token');
            expect(res1.body.token).not.toBe(res2.body.token);
        });
    });
});
