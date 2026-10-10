import { expect, test, type Page } from '@playwright/test';
import { ADMIN, SHOTS } from './helpers';

// Requiere el back real (npm run e2e:stack -- up; ver CLAUDE.md > Testing).
const EMAIL = ADMIN.email;
const PASSWORD = ADMIN.password;
const NAME = ADMIN.name; // mismo valor que siembra scripts/e2e-stack.mjs (e2e/helpers/admin.json)

async function login(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel(/Email/).fill(EMAIL);
  await page.getByLabel(/Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

test.describe('autenticación', () => {
  test('login correcto lleva al dashboard con el nombre del usuario', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { level: 1, name: /Ingresá a OKR Platform/ }),
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/auth-login.png` });

    await page.getByLabel(/Email/).fill(EMAIL);
    await page.getByLabel(/Contraseña/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(page.getByText(NAME).first()).toBeVisible();
    await expect(page.getByText('Administración', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/auth-dashboard.png`, fullPage: true });

    // Las cookies son httpOnly: el JS de la página no las ve.
    expect(await page.evaluate(() => document.cookie)).toBe('');
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'okr_at')).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
    });
    expect(cookies.find((c) => c.name === 'okr_rt')).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
    });
  });

  test('contraseña incorrecta muestra el error sin revelar qué falló', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/Email/).fill(EMAIL);
    await page.getByLabel(/Contraseña/).fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos' })).toHaveText(
      'No pudimos iniciar sesión. Revisá el email y la contraseña.',
    );
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/Email/)).toHaveValue(EMAIL);

    // Usuario inexistente: exactamente el mismo mensaje.
    await page.getByLabel(/Email/).fill('nadie@e2e.test');
    await page.getByLabel(/Contraseña/).fill('lo-que-sea');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos' })).toHaveText(
      'No pudimos iniciar sesión. Revisá el email y la contraseña.',
    );
  });

  test('una ruta protegida sin sesión redirige a /login?next= y vuelve tras ingresar', async ({
    page,
  }) => {
    await page.goto('/okrs');
    await expect(page).toHaveURL('/login?next=%2Fokrs');

    await page.goto('/?desde=e2e');
    await expect(page).toHaveURL('/login?next=%2F%3Fdesde%3De2e');
    await page.getByLabel(/Email/).fill(EMAIL);
    await page.getByLabel(/Contraseña/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL('/?desde=e2e');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  });

  test('un `next` externo se ignora (sin open redirect)', async ({ page }) => {
    await login(page, 'https://evil.example.com/robo');
    await expect(page).toHaveURL('/');
    await page.context().clearCookies();
    await login(page, '//evil.example.com');
    await expect(page).toHaveURL('/');
  });

  test('cerrar sesión borra las cookies y vuelve a pedir login', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/);
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).not.toContain('okr_at');
    expect(names).not.toContain('okr_rt');

    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('refresh silencioso: sin cookie de acceso, el proxy la renueva con el refresh', async ({
    page,
    context,
  }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    const before = (await context.cookies()).find((c) => c.name === 'okr_rt')?.value;

    // Simula el vencimiento del access (la cookie expira con el token).
    await context.clearCookies({ name: 'okr_at' });
    expect((await context.cookies()).some((c) => c.name === 'okr_at')).toBe(false);

    await page.goto('/');
    await expect(page.getByText(NAME).first()).toBeVisible();
    await expect(page).toHaveURL('/');

    const after = await context.cookies();
    expect(after.some((c) => c.name === 'okr_at')).toBe(true);
    expect(after.find((c) => c.name === 'okr_rt')?.value).not.toBe(before);
  });

  test('un refresh inválido cierra la sesión y manda a /login', async ({ page, context }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await context.clearCookies({ name: 'okr_at' });
    await context.addCookies([
      { name: 'okr_rt', value: 'token-inventado', url: 'http://localhost:3001', httpOnly: true },
    ]);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { level: 1, name: /Ingresá/ })).toBeVisible();
  });
});

test.describe('shell de la app', () => {
  test('el tooltip del botón de menú no se recorta en el borde izquierdo y Feedback y Reconocimientos están habilitados', async ({
    page,
  }) => {
    await login(page);
    await expect(page).toHaveURL('/');

    const toggle = page.getByRole('button', { name: 'Colapsar menú lateral' });
    await toggle.hover();
    const tooltip = page.getByText('Colapsar menú lateral', { exact: true }).first();
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);

    await expect(page.getByRole('link', { name: 'Feedback' })).toHaveAttribute('href', '/feedback');
    await expect(page.getByRole('link', { name: 'Reconocimientos' })).toHaveAttribute(
      'href',
      '/reconocimientos',
    );
    await expect(page.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
