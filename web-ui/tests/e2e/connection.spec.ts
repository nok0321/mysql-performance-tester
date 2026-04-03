import { test, expect } from '@playwright/test';
import { TEST_CONNECTION, cleanupConnections } from './helpers/setup';

test.describe('Connection Management', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupConnections(page);
  });

  test('register a new connection and verify connectivity', async ({ page }) => {
    await page.goto('/connections');

    // Should show empty state initially
    await expect(page.getByText(/接続が登録されていません|No connections/)).toBeVisible();

    // Open add dialog
    await page.getByRole('button', { name: /接続を追加|Add Connection/ }).click();

    // Fill form
    const inputs = page.locator('input');
    await inputs.nth(0).fill(TEST_CONNECTION.name);
    await inputs.nth(1).fill(TEST_CONNECTION.host);
    await inputs.nth(2).fill(TEST_CONNECTION.port);
    await inputs.nth(3).fill(TEST_CONNECTION.database);
    await inputs.nth(4).fill(TEST_CONNECTION.user);
    await inputs.nth(5).fill(TEST_CONNECTION.password);

    // Save
    await page.getByRole('button', { name: /保存|Save/ }).click();

    // Connection should appear in list
    await expect(page.getByText(TEST_CONNECTION.name)).toBeVisible({ timeout: 5_000 });

    // Test connectivity
    await page.getByRole('button', { name: /疎通確認|Test Connection/ }).click();
    await expect(page.getByText(/接続成功|Connected —/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('connection list shows registered connections', async ({ page }) => {
    // Create a connection via API
    await page.request.post('/api/connections', {
      data: {
        name: TEST_CONNECTION.name,
        host: TEST_CONNECTION.host,
        port: Number(TEST_CONNECTION.port),
        database: TEST_CONNECTION.database,
        user: TEST_CONNECTION.user,
        password: TEST_CONNECTION.password,
      },
    });

    await page.goto('/connections');
    await expect(page.getByText(TEST_CONNECTION.name)).toBeVisible({ timeout: 5_000 });
  });
});
