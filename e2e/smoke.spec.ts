import { expect, test } from '@playwright/test';

test('la home renderiza', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
