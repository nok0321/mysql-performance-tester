import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDbConfig, buildPoolConfig } from '../../lib/config/database-configuration.js';

describe('createDbConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear DB-related env vars to isolate tests
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('should return all default values when called with no arguments', () => {
    const config = createDbConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(3306);
    expect(config.user).toBe('root');
    expect(config.password).toBe('');
    expect(config.database).toBe('database');
    expect(config.connectTimeout).toBe(10000);
    expect(config.acquireTimeout).toBe(30000);
    expect(config.timeout).toBe(30000);
    expect(config.parallelThreads).toBe(5);
  });

  it('should use provided options over defaults', () => {
    const config = createDbConfig({
      host: '192.168.1.100',
      port: 3307,
      user: 'testuser',
      password: 'secret',
      database: 'mydb',
      connectTimeout: 5000,
      acquireTimeout: 15000,
      timeout: 20000,
      parallelThreads: 10,
    });

    expect(config.host).toBe('192.168.1.100');
    expect(config.port).toBe(3307);
    expect(config.user).toBe('testuser');
    expect(config.password).toBe('secret');
    expect(config.database).toBe('mydb');
    expect(config.connectTimeout).toBe(5000);
    expect(config.acquireTimeout).toBe(15000);
    expect(config.timeout).toBe(20000);
    expect(config.parallelThreads).toBe(10);
  });

  it('should use environment variables when options are not provided', () => {
    process.env.DB_HOST = 'env-host';
    process.env.DB_PORT = '3308';
    process.env.DB_USER = 'envuser';
    process.env.DB_PASSWORD = 'envpass';
    process.env.DB_NAME = 'envdb';

    const config = createDbConfig();
    expect(config.host).toBe('env-host');
    expect(config.port).toBe(3308);
    expect(config.user).toBe('envuser');
    expect(config.password).toBe('envpass');
    expect(config.database).toBe('envdb');
  });

  it('should prioritize options over environment variables', () => {
    process.env.DB_HOST = 'env-host';
    process.env.DB_USER = 'envuser';

    const config = createDbConfig({ host: 'opt-host', user: 'optuser' });
    expect(config.host).toBe('opt-host');
    expect(config.user).toBe('optuser');
  });

  it('should handle port as string via Number() conversion', () => {
    // When port is passed as a string-like value (e.g. from CLI parsing),
    // Number() converts it
    const config = createDbConfig({ port: '3307' as unknown as number });
    expect(config.port).toBe(3307);
  });

  it('should fall back to 3306 for invalid port values', () => {
    const config = createDbConfig({ port: 0 });
    expect(config.port).toBe(3306);
  });

  it('should handle password with nullish coalescing (empty string is valid)', () => {
    // password uses ?? so explicit empty string should be kept
    const config = createDbConfig({ password: '' });
    expect(config.password).toBe('');
  });

  it('should allow partial options', () => {
    const config = createDbConfig({ host: 'custom-host' });
    expect(config.host).toBe('custom-host');
    expect(config.port).toBe(3306);
    expect(config.user).toBe('root');
  });
});

describe('buildPoolConfig', () => {
  it('should build a pool config from a DbConfig', () => {
    const dbConfig = createDbConfig({
      host: 'myhost',
      port: 3307,
      user: 'pooluser',
      password: 'poolpass',
      database: 'pooldb',
      connectTimeout: 5000,
      acquireTimeout: 15000,
      parallelThreads: 5,
    });

    const pool = buildPoolConfig(dbConfig);

    expect(pool.host).toBe('myhost');
    expect(pool.port).toBe(3307);
    expect(pool.user).toBe('pooluser');
    expect(pool.password).toBe('poolpass');
    expect(pool.database).toBe('pooldb');
    expect(pool.connectTimeout).toBe(5000);
    expect(pool.acquireTimeout).toBe(15000);
    expect(pool.waitForConnections).toBe(true);
    expect(pool.queueLimit).toBe(0);
    expect(pool.enableKeepAlive).toBe(true);
    expect(pool.keepAliveInitialDelay).toBe(0);
    expect(pool.multipleStatements).toBe(false);
    expect(pool.idleTimeout).toBe(60000);
  });

  it('should compute connectionLimit as max(10, parallelThreads + 5)', () => {
    // parallelThreads = 5 => 5 + 5 = 10, max(10, 10) = 10
    const pool5 = buildPoolConfig(createDbConfig({ parallelThreads: 5 }));
    expect(pool5.connectionLimit).toBe(10);

    // parallelThreads = 20 => 20 + 5 = 25, max(10, 25) = 25
    const pool20 = buildPoolConfig(createDbConfig({ parallelThreads: 20 }));
    expect(pool20.connectionLimit).toBe(25);

    // parallelThreads = 1 => 1 + 5 = 6, max(10, 6) = 10
    const pool1 = buildPoolConfig(createDbConfig({ parallelThreads: 1 }));
    expect(pool1.connectionLimit).toBe(10);
  });

  it('should compute maxIdle as ceil(connectionLimit / 2)', () => {
    // connectionLimit = 10 => maxIdle = 5
    const pool = buildPoolConfig(createDbConfig({ parallelThreads: 5 }));
    expect(pool.maxIdle).toBe(5);

    // connectionLimit = 25 => maxIdle = 13
    const pool2 = buildPoolConfig(createDbConfig({ parallelThreads: 20 }));
    expect(pool2.maxIdle).toBe(13);
  });
});
