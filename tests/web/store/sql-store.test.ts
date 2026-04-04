import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb } from '../../../web/store/database.js';
import * as store from '../../../web/store/sql-store.js';

describe('SqlStore', () => {
    beforeEach(() => {
        initDb(':memory:');
    });

    afterEach(() => {
        closeDb();
    });

    describe('create', () => {
        it('creates a SQL snippet with default values', async () => {
            const item = await store.create({});
            expect(item.id).toMatch(/^sql_/);
            expect(item.name).toBe('Untitled SQL');
            expect(item.sql).toBe('');
            expect(item.category).toBe('SELECT');
            expect(item.tags).toEqual([]);
        });

        it('creates a SQL snippet with custom values', async () => {
            const item = await store.create({
                name: 'Test Query',
                sql: 'SELECT * FROM users',
                category: 'select',
                description: 'Get all users',
                tags: ['users', 'select'],
            });
            expect(item.name).toBe('Test Query');
            expect(item.sql).toBe('SELECT * FROM users');
            expect(item.category).toBe('select');
            expect(item.description).toBe('Get all users');
            expect(item.tags).toEqual(['users', 'select']);
        });
    });

    describe('getAll', () => {
        it('returns empty array when no items', async () => {
            const all = await store.getAll();
            expect(all).toEqual([]);
        });

        it('returns all items', async () => {
            await store.create({ name: 'Q1' });
            await store.create({ name: 'Q2' });
            const all = await store.getAll();
            expect(all).toHaveLength(2);
        });

        it('filters by category', async () => {
            await store.create({ name: 'Q1', category: 'select' });
            await store.create({ name: 'Q2', category: 'insert' });
            const selectOnly = await store.getAll({ category: 'select' });
            expect(selectOnly).toHaveLength(1);
            expect(selectOnly[0].category).toBe('select');
        });

        it('filters by keyword in name', async () => {
            await store.create({ name: 'User Query', sql: 'SELECT 1' });
            await store.create({ name: 'Order Query', sql: 'SELECT 2' });
            const results = await store.getAll({ keyword: 'User' });
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('User Query');
        });
    });

    describe('getById', () => {
        it('returns null for non-existent ID', async () => {
            const result = await store.getById('non-existent');
            expect(result).toBeNull();
        });

        it('returns the correct item', async () => {
            const created = await store.create({ name: 'Test' });
            const found = await store.getById(created.id);
            expect(found).not.toBeNull();
            expect(found!.name).toBe('Test');
        });
    });

    describe('getCategories', () => {
        it('returns empty array when no items', async () => {
            const cats = await store.getCategories();
            expect(cats).toEqual([]);
        });

        it('returns unique categories', async () => {
            await store.create({ category: 'select' });
            await store.create({ category: 'insert' });
            await store.create({ category: 'select' });
            const cats = await store.getCategories();
            expect(cats).toHaveLength(2);
            expect(cats).toContain('select');
            expect(cats).toContain('insert');
        });
    });

    describe('update', () => {
        it('returns null for non-existent ID', async () => {
            const result = await store.update('non-existent', { name: 'New' });
            expect(result).toBeNull();
        });

        it('updates fields', async () => {
            const created = await store.create({ name: 'Old', sql: 'SELECT 1' });
            const updated = await store.update(created.id, { name: 'New', sql: 'SELECT 2' });
            expect(updated!.name).toBe('New');
            expect(updated!.sql).toBe('SELECT 2');
        });

        it('updates tags', async () => {
            const created = await store.create({ tags: ['a'] });
            const updated = await store.update(created.id, { tags: ['a', 'b', 'c'] });
            expect(updated!.tags).toEqual(['a', 'b', 'c']);
        });
    });

    describe('remove', () => {
        it('returns false for non-existent ID', async () => {
            const result = await store.remove('non-existent');
            expect(result).toBe(false);
        });

        it('deletes an existing item', async () => {
            const created = await store.create({});
            const result = await store.remove(created.id);
            expect(result).toBe(true);
            const all = await store.getAll();
            expect(all).toHaveLength(0);
        });
    });
});
