import { test, expect } from '@playwright/test';
import { registerConnection, cleanupConnections } from './helpers/setup';

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupConnections(page);
    await registerConnection(page);

    // Run a test to generate a report
    await page.goto('/single-test');
    await page.locator('select').first().selectOption({ label: 'E2E Test Connection' });
    await page.getByRole('button', { name: /直接入力|Direct Input/ }).click();
    await page.locator('textarea').fill('SELECT 1;');
    await page.locator('input[type="number"]').first().fill('3');
    await page.getByRole('button', { name: /テスト実行|Run Test/ }).click();
    await expect(page.getByText(/Mean|平均/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('report list shows executed test and detail view works', async ({ page }) => {
    await page.goto('/reports');

    // Report should appear in list
    await expect(page.getByText(/Web UI Test/).first()).toBeVisible({ timeout: 5_000 });

    // Click to view details
    await page.getByText(/Web UI Test/).first().click();

    // Detail view should show stats
    await expect(page.getByText(/Mean|平均/).first()).toBeVisible({ timeout: 5_000 });

    // Export buttons should be present
    await expect(page.getByRole('button', { name: /JSON/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /CSV/ })).toBeVisible();
  });
});
