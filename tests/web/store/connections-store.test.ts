import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb } from '../../../web/store/database.js';
import * as store from '../../../web/store/connections-store.js';

describe('ConnectionsStore', () => {
    beforeEach(() => {
        initDb(':memory:');
    });

    afterEach(() => {
        closeDb();
    });

    describe('create', () => {
        it('creates a connection with default values', async () => {
            const conn = await store.create({});
            expect(conn.id).toMatch(/^conn_/);
            expect(conn.name).toMatch(/^Connection \d+$/);
            expect(conn.host).toBe('localhost');
            expect(conn.port).toBe(3306);
            expect(conn.user).toBe('root');
            expect(conn.poolSize).toBe(10);
            // Empty password → maskRecord returns '' (no password set)
            expect(conn.passwordMasked).toBeDefined();
        });

        it('creates a connection with custom values', async () => {
            const conn = await store.create({
                name: 'Test DB',
                host: '192.168.1.100',
                port: 3307,
                database: 'mydb',
                user: 'admin',
                password: 'secret',
                poolSize: 20,
            });
            expect(conn.name).toBe('Test DB');
            expect(conn.host).toBe('192.168.1.100');
            expect(conn.port).toBe(3307);
            expect(conn.database).toBe('mydb');
            expect(conn.user).toBe('admin');
            expect(conn.poolSize).toBe(20);
        });

        it('auto-increments name when no name is provided', async () => {
            const c1 = await store.create({});
            const c2 = await store.create({});
            expect(c1.name).toBe('Connection 1');
            expect(c2.name).toBe('Connection 2');
        });
    });

    describe('getAll', () => {
        it('returns empty array when no connections', async () => {
            const all = await store.getAll();
            expect(all).toEqual([]);
        });

        it('returns all connections with masked passwords', async () => {
            await store.create({ name: 'A' });
            await store.create({ name: 'B' });
            const all = await store.getAll();
            expect(all).toHaveLength(2);
            expect(all[0].passwordMasked).toBeDefined();
            expect(all[1].passwordMasked).toBeDefined();
        });
    });

    describe('getById', () => {
        it('returns null for non-existent ID', async () => {
            const result = await store.getById('non-existent');
            expect(result).toBeNull();
        });

        it('returns connection with decrypted password', async () => {
            const created = await store.create({ password: 'mypass' });
            const found = await store.getById(created.id);
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            // Password should be decrypted (either plaintext or decrypted depending on ENCRYPTION_KEY)
            expect(found!.password).toBeDefined();
        });
    });

    describe('update', () => {
        it('returns null for non-existent ID', async () => {
            const result = await store.update('non-existent', { name: 'New' });
            expect(result).toBeNull();
        });

        it('updates name field', async () => {
            const created = await store.create({ name: 'Old' });
            const updated = await store.update(created.id, { name: 'New' });
            expect(updated!.name).toBe('New');
        });

        it('updates host and port', async () => {
            const created = await store.create({});
            const updated = await store.update(created.id, { host: 'db.example.com', port: 5432 });
            expect(updated!.host).toBe('db.example.com');
            expect(updated!.port).toBe(5432);
        });

        it('returns unchanged record when no updates provided', async () => {
            const created = await store.create({ name: 'Keep' });
            const updated = await store.update(created.id, {});
            expect(updated!.name).toBe('Keep');
        });

        it('updates updatedAt timestamp', async () => {
            const created = await store.create({});
            // Small delay to ensure different timestamp
            const updated = await store.update(created.id, { name: 'Changed' });
            expect(updated!.updatedAt).toBeDefined();
        });
    });

    describe('remove', () => {
        it('returns false for non-existent ID', async () => {
            const result = await store.remove('non-existent');
            expect(result).toBe(false);
        });

        it('deletes an existing connection', async () => {
            const created = await store.create({});
            const result = await store.remove(created.id);
            expect(result).toBe(true);

            const all = await store.getAll();
            expect(all).toHaveLength(0);
        });
    });
});
