import { test, expect } from '@playwright/test';
import { registerConnection, cleanupConnections } from './helpers/setup';

test.describe('Parallel Test Execution', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupConnections(page);
    await registerConnection(page);
  });

  test('execute parallel test from directory and verify results', async ({ page }) => {
    await page.goto('/parallel-test');

    // Select connection
    await page.locator('select').first().selectOption({ label: 'E2E Test Connection' });

    // Set threads = 2, iterations = 3
    const inputs = page.locator('input[type="number"]');
    await inputs.nth(0).fill('2');
    await inputs.nth(1).fill('3');

    // Execute parallel test
    await page.getByRole('button', { name: /並列テスト実行|Run Parallel/ }).click();

    // Wait for results — QPS metrics should appear
    await expect(page.getByText(/QPS/).first()).toBeVisible({ timeout: 30_000 });

    // Should show strategy results with file breakdown
    await expect(page.getByText(/01_simple_select/).first()).toBeVisible();
    await expect(page.getByText(/100/).first()).toBeVisible(); // 100% success rate
  });
});
