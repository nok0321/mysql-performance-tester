import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb } from '../../web/store/database.js';
import * as store from '../../web/store/sql-store.js';

describe('sql-store', () => {
  beforeEach(() => {
    resetDb();
    initDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('create', () => {
    it('should create a SQL snippet with defaults', async () => {
      const result = await store.create({});
      expect(result.id).toMatch(/^sql_/);
      expect(result.name).toBe('Untitled SQL');
      expect(result.category).toBe('SELECT');
      expect(result.tags).toEqual([]);
    });

    it('should create a SQL snippet with custom values', async () => {
      const result = await store.create({
        name: 'Get Users',
        sql: 'SELECT * FROM users',
        category: 'READ',
        description: 'Fetch all users',
        tags: ['perf', 'users'],
      });
      expect(result.name).toBe('Get Users');
      expect(result.sql).toBe('SELECT * FROM users');
      expect(result.tags).toEqual(['perf', 'users']);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no items', async () => {
      const result = await store.getAll();
      expect(result).toEqual([]);
    });

    it('should filter by category', async () => {
      await store.create({ name: 'A', category: 'SELECT' });
      await store.create({ name: 'B', category: 'INSERT' });
      await store.create({ name: 'C', category: 'SELECT' });

      const result = await store.getAll({ category: 'SELECT' });
      expect(result).toHaveLength(2);
      expect(result.every(r => r.category === 'SELECT')).toBe(true);
    });

    it('should filter by keyword in name', async () => {
      await store.create({ name: 'User Query', sql: 'SELECT 1' });
      await store.create({ name: 'Product Query', sql: 'SELECT 2' });

      const result = await store.getAll({ keyword: 'user' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('User Query');
    });

    it('should filter by keyword in SQL', async () => {
      await store.create({ name: 'A', sql: 'SELECT * FROM users' });
      await store.create({ name: 'B', sql: 'SELECT * FROM products' });

      const result = await store.getAll({ keyword: 'products' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('B');
    });

    it('should combine category and keyword filters', async () => {
      await store.create({ name: 'User Select', sql: 'SELECT * FROM users', category: 'SELECT' });
      await store.create({ name: 'User Insert', sql: 'INSERT INTO users', category: 'INSERT' });
      await store.create({ name: 'Product Select', sql: 'SELECT * FROM products', category: 'SELECT' });

      const result = await store.getAll({ category: 'SELECT', keyword: 'user' });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('User Select');
    });
  });

  describe('getById', () => {
    it('should return null for non-existent ID', async () => {
      const result = await store.getById('sql_nonexistent');
      expect(result).toBeNull();
    });

    it('should return the item with parsed tags', async () => {
      const created = await store.create({ name: 'Test', tags: ['a', 'b'] });
      const result = await store.getById(created.id);
      expect(result!.tags).toEqual(['a', 'b']);
    });
  });

  describe('update', () => {
    it('should return null for non-existent ID', async () => {
      const result = await store.update('sql_nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('should update whitelisted fields', async () => {
      const created = await store.create({ name: 'Old' });
      const result = await store.update(created.id, { name: 'New', category: 'INSERT' });
      expect(result!.name).toBe('New');
      expect(result!.category).toBe('INSERT');
    });

    it('should update tags', async () => {
      const created = await store.create({ tags: ['old'] });
      const result = await store.update(created.id, { tags: ['new', 'updated'] });
      expect(result!.tags).toEqual(['new', 'updated']);
    });

    it('should return existing record when no updatable fields', async () => {
      const created = await store.create({ name: 'Keep' });
      const result = await store.update(created.id, {});
      expect(result!.name).toBe('Keep');
    });
  });

  describe('remove', () => {
    it('should return false for non-existent ID', async () => {
      const result = await store.remove('sql_nonexistent');
      expect(result).toBe(false);
    });

    it('should remove an existing item', async () => {
      const created = await store.create({ name: 'Delete Me' });
      expect(await store.remove(created.id)).toBe(true);
      expect(await store.getAll()).toHaveLength(0);
    });
  });

  describe('getCategories', () => {
    it('should return empty array when no items', async () => {
      const result = await store.getCategories();
      expect(result).toEqual([]);
    });

    it('should return unique sorted categories', async () => {
      await store.create({ category: 'SELECT' });
      await store.create({ category: 'INSERT' });
      await store.create({ category: 'SELECT' });
      await store.create({ category: 'DELETE' });

      const result = await store.getCategories();
      expect(result).toEqual(['DELETE', 'INSERT', 'SELECT']);
    });
  });
});
