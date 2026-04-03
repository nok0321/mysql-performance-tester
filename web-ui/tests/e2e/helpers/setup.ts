import { type Page, expect } from '@playwright/test';

/** Default MySQL connection info for tests. */
export const TEST_CONNECTION = {
  name: 'E2E Test Connection',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '3306',
  database: process.env.DB_NAME || 'perf_test',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'admin',
};

/**
 * Register a MySQL connection via the Web UI.
 */
export async function registerConnection(page: Page): Promise<string> {
  await page.goto('/connections');

  await page.getByRole('button', { name: /接続を追加|Add Connection/ }).click();

  const inputs = page.locator('input');
  await inputs.nth(0).fill(TEST_CONNECTION.name);
  await inputs.nth(1).fill(TEST_CONNECTION.host);
  await inputs.nth(2).fill(TEST_CONNECTION.port);
  await inputs.nth(3).fill(TEST_CONNECTION.database);
  await inputs.nth(4).fill(TEST_CONNECTION.user);
  await inputs.nth(5).fill(TEST_CONNECTION.password);

  await page.getByRole('button', { name: /保存|Save/ }).click();
  await expect(page.getByText(TEST_CONNECTION.name).first()).toBeVisible({ timeout: 5_000 });

  return TEST_CONNECTION.name;
}

/**
 * Delete all connections via API to reset state.
 */
export async function cleanupConnections(page: Page): Promise<void> {
  const res = await page.request.get('/api/connections');
  const body = await res.json();
  const connections = body.data || body || [];
  for (const conn of connections) {
    if (conn.id) {
      await page.request.delete(`/api/connections/${conn.id}`);
    }
  }
}
