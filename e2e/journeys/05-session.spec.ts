import { expect, test } from '@playwright/test';
import { ADMIN } from '../helpers';

/**
 * Sesión de punta a punta: login con `next`, refresh silencioso sin cookie de acceso, logout que termina
 * la sesión, ruta protegida a /login?next= y `next` externo ignorado.
 */
const field = (page: import('@playwright/test').Page) => ({
  fill: async () => {
    await page.getByLabel(/Email/).fill(ADMIN.email);
    await page.getByLabel(/Contraseña/).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
  },
});

test('login con next, refresh silencioso, logout, ruta protegida y next externo', async ({
  page,
  context,
}) => {
  // Ruta protegida sin sesión -> /login?next=; al ingresar vuelve a donde iba.
  await page.goto('/equipos');
  await expect(page).toHaveURL('/login?next=%2Fequipos');
  await field(page).fill();
  await expect(page).toHaveURL('/equipos');
  await expect(page.getByRole('heading', { level: 1, name: 'Equipos' })).toBeVisible();

  // Refresh silencioso: sin la cookie de acceso, el proxy la renueva con el refresh y se rota el refresh.
  const refreshBefore = (await context.cookies()).find((c) => c.name === 'okr_rt')?.value;
  await context.clearCookies({ name: 'okr_at' });
  await page.goto('/objetivos');
  await expect(page).toHaveURL(/\/objetivos/);
  await expect(page.getByText(ADMIN.name).first()).toBeVisible();
  const after = await context.cookies();
  expect(after.some((c) => c.name === 'okr_at')).toBe(true);
  expect(after.find((c) => c.name === 'okr_rt')?.value).not.toBe(refreshBefore);

  // Logout: borra las cookies y la sesión queda terminada (el refresh viejo ya no sirve).
  const staleRefresh = after.find((c) => c.name === 'okr_rt')!.value;
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).not.toContain('okr_at');
  expect(names).not.toContain('okr_rt');
  await context.addCookies([
    { name: 'okr_rt', value: staleRefresh, url: 'http://localhost:3001', httpOnly: true },
  ]);
  await page.goto('/objetivos');
  await expect(page).toHaveURL(/\/login/);
  await context.clearCookies();

  // `next` externo o protocol-relative: se ignora y se va al inicio.
  for (const next of ['https://evil.example.com/robo', '//evil.example.com']) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await field(page).fill();
    await expect(page).toHaveURL('/');
    await page.context().clearCookies();
  }
});
