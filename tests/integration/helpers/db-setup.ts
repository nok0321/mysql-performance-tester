/**
 * Integration test lifecycle helpers
 *
 * Provides deterministic DB setup/teardown for integration tests
 * running against the Docker MySQL 8.0 container.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { DatabaseConnection } from '../../../lib/core/database-connection.js';
import { createDbConfig } from '../../../lib/config/database-configuration.js';
import { createTestConfig } from '../../../lib/config/test-configuration.js';
import type { DbConfig, TestConfig, TestConfigOptions } from '../../../lib/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.test from project root
dotenvConfig({ path: resolve(__dirname, '../../../.env.test') });

/**
 * Create a DbConfig pointing at the Docker test container
 */
export function createTestDbConfig(): DbConfig {
    return createDbConfig({
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || '3307',
        user: process.env.DB_USER || 'testuser',
        password: process.env.DB_PASSWORD || 'testpassword',
        database: process.env.DB_NAME || 'perf_test',
    });
}

/**
 * Create a TestConfig with sensible defaults for integration tests
 */
export function createIntegrationTestConfig(overrides: TestConfigOptions = {}): TestConfig {
    return createTestConfig({
        testIterations: 3,
        parallelThreads: 2,
        enableWarmup: false,
        enableExplainAnalyze: true,
        enablePerformanceSchema: true,
        enableOptimizerTrace: true,
        enableBufferPoolMonitoring: true,
        enableStatistics: true,
        generateReport: false,
        enableDebugOutput: false,
        ...overrides,
    });
}

/**
 * Create and initialize a DatabaseConnection to the test container.
 * Retries up to 10 times (for Docker startup).
 */
export async function createTestConnection(): Promise<DatabaseConnection> {
    const dbConfig = createTestDbConfig();
    const db = new DatabaseConnection(dbConfig);
    await db.initialize();

    const ok = await db.testConnection(10, 2000);
    if (!ok) {
        throw new Error(
            'Could not connect to test MySQL container. '
            + 'Run: npm run docker:test:up',
        );
    }
    return db;
}

/**
 * Insert deterministic seed data for integration tests
 */
export async function seedTestData(db: DatabaseConnection): Promise<void> {
    // Users (10 rows)
    const userValues = Array.from({ length: 10 }, (_, i) => {
        const id = i + 1;
        const status = id <= 7 ? 'active' : id <= 9 ? 'inactive' : 'banned';
        return `(${id}, 'User ${id}', 'test${id}@example.com', ${20 + id}, '${status}', ${(id * 10.5).toFixed(2)}, 'Profile for user ${id}')`;
    }).join(',\n');

    await db.query(`INSERT INTO users (id, name, email, age, status, score, profile_text) VALUES\n${userValues}`);

    // Products (5 rows)
    const products = [
        "(1, 'Widget A', 'electronics', 29.99, 100, 1)",
        "(2, 'Widget B', 'electronics', 49.99, 50, 1)",
        "(3, 'Gadget C', 'gadgets', 99.99, 25, 1)",
        "(4, 'Tool D', 'tools', 15.50, 200, 1)",
        "(5, 'Part E', 'tools', 5.99, 500, 0)",
    ];
    await db.query(`INSERT INTO products (id, name, category, price, stock_quantity, is_active) VALUES\n${products.join(',\n')}`);

    // Orders (10 rows)
    const orderValues = Array.from({ length: 10 }, (_, i) => {
        const id = i + 1;
        const userId = ((i % 7) + 1); // users 1-7
        const statuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
        const status = statuses[i % statuses.length];
        const amount = (id * 25.0).toFixed(2);
        return `(${id}, ${userId}, '${status}', ${amount})`;
    }).join(',\n');

    await db.query(`INSERT INTO orders (id, user_id, status, total_amount) VALUES\n${orderValues}`);

    // Order items (20 rows)
    const itemValues = Array.from({ length: 20 }, (_, i) => {
        const id = i + 1;
        const orderId = ((i % 10) + 1);
        const productId = ((i % 5) + 1);
        const quantity = (i % 3) + 1;
        const unitPrice = [29.99, 49.99, 99.99, 15.50, 5.99][i % 5];
        return `(${id}, ${orderId}, ${productId}, ${quantity}, ${unitPrice})`;
    }).join(',\n');

    await db.query(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES\n${itemValues}`);
}

/**
 * Truncate all tables (respecting FK constraints)
 */
export async function cleanupTestData(db: DatabaseConnection): Promise<void> {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('TRUNCATE TABLE order_items');
    await db.query('TRUNCATE TABLE orders');
    await db.query('TRUNCATE TABLE products');
    await db.query('TRUNCATE TABLE users');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * Close the database connection pool
 */
export async function teardownConnection(db: DatabaseConnection): Promise<void> {
    await db.close();
}
