import { test, expect } from '@playwright/test';

const PAGES = [
  { path: '/connections', title: /Connections|接続管理/ },
  { path: '/sql-library', title: /SQL Library|SQL ライブラリ/ },
  { path: '/single-test', title: /Single Test|単一テスト/ },
  { path: '/parallel-test', title: /Parallel Test|並列テスト/ },
  { path: '/comparison', title: /A\/B Comparison|A\/B 比較/ },
  { path: '/reports', title: /Reports|レポート/ },
  { path: '/analytics', title: /Analytics|アナリティクス/ },
  { path: '/history', title: /Query History|クエリ履歴/ },
  { path: '/settings', title: /Settings|設定/ },
];

test.describe('Navigation', () => {
  test('all pages load without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (const { path, title } of PAGES) {
      await page.goto(path);
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
    }

    expect(errors).toHaveLength(0);
  });

  test('sidebar navigation works via SPA routing', async ({ page }) => {
    await page.goto('/single-test');

    // Navigate to connections via sidebar link
    await page.locator('a[href="/connections"]').click();
    await expect(page).toHaveURL(/\/connections/);
    await expect(page.getByText(/Connections|接続管理/).first()).toBeVisible();

    // Navigate to reports
    await page.locator('a[href="/reports"]').click();
    await expect(page).toHaveURL(/\/reports/);
    await expect(page.getByText(/Reports|レポート/).first()).toBeVisible();
  });

  test('WebSocket connection indicator shows connected', async ({ page }) => {
    await page.goto('/single-test');
    await expect(page.getByText(/WS Connected/)).toBeVisible({ timeout: 10_000 });
  });
});
