import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../web/app.js';
import { initDb, closeDb } from '../../../web/store/database.js';

describe('Reports Routes', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-minimum-32chars!!';
        initDb(':memory:');
        app = createApp();
    });

    afterEach(() => {
        closeDb();
    });

    describe('GET /api/reports', () => {
        it('returns empty reports list initially', async () => {
            const res = await request(app).get('/api/reports');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
            expect(res.body.pagination).toBeDefined();
        });

        it('supports type filter', async () => {
            const res = await request(app).get('/api/reports?type=single');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('supports pagination', async () => {
            const res = await request(app).get('/api/reports?limit=10&offset=0');
            expect(res.status).toBe(200);
            expect(res.body.pagination.limit).toBe(10);
        });
    });

    describe('GET /api/reports/:id', () => {
        it('returns 404 for non-existent report', async () => {
            const res = await request(app).get('/api/reports/report_nonexistent');
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/reports/:id/export', () => {
        it('returns 404 for non-existent report export', async () => {
            const res = await request(app).get('/api/reports/report_nonexistent/export?format=json');
            expect(res.status).toBe(500);
        });
    });
});
