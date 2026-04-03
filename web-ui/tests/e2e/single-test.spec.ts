import { test, expect } from '@playwright/test';
import { registerConnection, cleanupConnections } from './helpers/setup';

test.describe('Single Test Execution', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupConnections(page);
    await registerConnection(page);
  });

  test('execute a SQL query and verify all result tabs', async ({ page }) => {
    await page.goto('/single-test');

    // Select connection
    await page.locator('select').first().selectOption({ label: 'E2E Test Connection' });

    // Switch to direct input
    await page.getByRole('button', { name: /直接入力|Direct Input/ }).click();

    // Enter SQL
    await page.locator('textarea').fill('SELECT * FROM users LIMIT 10;');

    // Set iterations to 5
    const iterInput = page.locator('input[type="number"]').first();
    await iterInput.fill('5');

    // Execute test
    await page.getByRole('button', { name: /テスト実行|Run Test/ }).click();

    // Wait for results — stat cards should appear
    await expect(page.getByText(/Mean|平均/).first()).toBeVisible({ timeout: 30_000 });

    // --- Statistics tab should show data ---
    await page.getByRole('button', { name: /統計|Stats/ }).first().click().catch(() => {});
    await expect(page.getByText(/P50|P95/).first()).toBeVisible();

    // --- Distribution tab ---
    await page.getByRole('button', { name: /分布|Distribution/ }).click();
    // Should have recharts SVG content (not empty state)
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({ timeout: 5_000 });

    // --- EXPLAIN tab ---
    await page.getByRole('button', { name: /EXPLAIN/ }).click();
    await expect(page.locator('.code-block').first()).toBeVisible({ timeout: 5_000 });

    // --- Recommendation tab ---
    await page.getByRole('button', { name: /推奨|Recommend/ }).click();
    // Should show some content (issues, recommendations, or no-issues message)
    const content = page.locator('main');
    await expect(content.locator('.alert, .empty-state').first()).toBeVisible({ timeout: 5_000 });
  });
});
