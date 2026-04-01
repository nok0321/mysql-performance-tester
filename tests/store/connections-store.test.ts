import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb } from '../../web/store/database.js';
import * as store from '../../web/store/connections-store.js';

describe('connections-store', () => {
  beforeEach(() => {
    resetDb();
    initDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  describe('create', () => {
    it('should create a connection with defaults', async () => {
      const result = await store.create({});
      expect(result.id).toMatch(/^conn_/);
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(3306);
      // Empty password defaults to empty mask
      expect(result.passwordMasked).toBe('');
      expect(result.createdAt).toBeDefined();
    });

    it('should create a connection with custom values', async () => {
      const result = await store.create({
        name: 'My DB',
        host: '192.168.1.1',
        port: 3307,
        database: 'mydb',
        user: 'admin',
        password: 'secret',
        poolSize: 20,
      });
      expect(result.name).toBe('My DB');
      expect(result.host).toBe('192.168.1.1');
      expect(result.port).toBe(3307);
      expect(result.database).toBe('mydb');
      expect(result.user).toBe('admin');
      expect(result.poolSize).toBe(20);
      expect(result.passwordMasked).toBe('••••••••');
    });

    it('should auto-name connections sequentially', async () => {
      const c1 = await store.create({});
      const c2 = await store.create({});
      expect(c1.name).toBe('Connection 1');
      expect(c2.name).toBe('Connection 2');
    });
  });

  describe('getAll', () => {
    it('should return empty array when no connections', async () => {
      const result = await store.getAll();
      expect(result).toEqual([]);
    });

    it('should return all connections with masked passwords', async () => {
      await store.create({ name: 'A', password: 'secret1' });
      await store.create({ name: 'B', password: 'secret2' });

      const result = await store.getAll();
      expect(result).toHaveLength(2);
      expect(result[0].passwordMasked).toBe('••••••••');
      expect(result[1].passwordMasked).toBe('••••••••');
      // Should not have the password field
      expect((result[0] as Record<string, unknown>).password).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should return null for non-existent ID', async () => {
      const result = await store.getById('conn_nonexistent');
      expect(result).toBeNull();
    });

    it('should return connection with decrypted password', async () => {
      const created = await store.create({ name: 'Test', password: 'mysecret' });
      const result = await store.getById(created.id);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test');
      expect(result!.password).toBe('mysecret');
    });
  });

  describe('update', () => {
    it('should return null for non-existent ID', async () => {
      const result = await store.update('conn_nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('should update whitelisted fields', async () => {
      const created = await store.create({ name: 'Old', host: 'old.host' });
      // Ensure time difference
      await new Promise(r => setTimeout(r, 10));
      const result = await store.update(created.id, { name: 'New', host: 'new.host' });
      expect(result!.name).toBe('New');
      expect(result!.host).toBe('new.host');
    });

    it('should encrypt updated password', async () => {
      const created = await store.create({ password: 'old' });
      await store.update(created.id, { password: 'new' });
      const fetched = await store.getById(created.id);
      expect(fetched!.password).toBe('new');
    });

    it('should coerce port and poolSize to numbers', async () => {
      const created = await store.create({});
      const result = await store.update(created.id, { port: '3307' as unknown as number, poolSize: '25' as unknown as number });
      expect(result!.port).toBe(3307);
      expect(result!.poolSize).toBe(25);
    });

    it('should ignore non-whitelisted fields', async () => {
      const created = await store.create({});
      const result = await store.update(created.id, { id: 'hacked' } as unknown as store.UpdateConnectionInput);
      expect(result!.id).toBe(created.id);
    });
  });

  describe('remove', () => {
    it('should return false for non-existent ID', async () => {
      const result = await store.remove('conn_nonexistent');
      expect(result).toBe(false);
    });

    it('should remove an existing connection', async () => {
      const created = await store.create({ name: 'Delete Me' });
      const result = await store.remove(created.id);
      expect(result).toBe(true);

      const all = await store.getAll();
      expect(all).toHaveLength(0);
    });
  });
});
