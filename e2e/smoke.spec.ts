import { expect, test } from '@playwright/test';

test('la home sin sesión redirige al login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
