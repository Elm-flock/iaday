import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  API,
  adminSession,
  dialog,
  loginAdminApi,
  loginApi,
  navLink,
  uniqueSuffix,
} from '../helpers';

/**
 * Recorrido: cambio de contraseña obligatorio. Administración crea una persona SIN contraseña por la UI (el back
 * genera una y la muestra una sola vez), la persona ingresa, solo puede cambiarla y después usa la app.
 */
const suffix = uniqueSuffix();
const person = { name: `Pía Primera ${suffix}`, email: `pia.primera.${suffix}@e2e.test` };
const NEW_PASSWORD = 'Una frase larga y segura 2026';

const ctx = { initial: '' };

async function scanBothThemes(page: Page, label: string) {
  for (const dark of [false, true]) {
    await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
    await page.waitForTimeout(400);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect
      .soft(
        blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        `${label} (${dark ? 'oscuro' : 'claro'})`,
      )
      .toEqual([]);
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('administración crea un usuario sin contraseña: la clave generada se muestra una sola vez', async ({
  browser,
}) => {
  const page = await adminSession(browser);
  await navLink(page, 'Usuarios').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await dialog(page)
    .getByLabel(/Nombre/)
    .fill(person.name);
  await dialog(page).getByLabel(/Email/).fill(person.email);
  // La contraseña es opcional: se deja en blanco.
  await expect(dialog(page).getByLabel('Contraseña inicial')).not.toHaveAttribute('required');
  await dialog(page).getByRole('button', { name: 'Crear usuario' }).click();

  const reveal = page.getByRole('dialog', { name: 'Usuario creado' });
  await expect(reveal).toBeVisible();
  await expect(reveal.getByText('Se muestra una sola vez')).toBeVisible();
  ctx.initial = (await reveal.locator('code').innerText()).trim();
  expect(ctx.initial.length).toBeGreaterThanOrEqual(12);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await reveal.getByRole('button', { name: 'Copiar contraseña' }).click();
  await expect(reveal.getByText('Contraseña copiada al portapapeles.')).toBeVisible();

  await reveal.getByRole('button', { name: 'Ya la copié, cerrar' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('row', { name: new RegExp(person.name) })).toContainText(
    person.email,
  );
  // Al volver a abrir el alta, la clave ya no está en ningún lado.
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByText(ctx.initial)).toHaveCount(0);
  await page.context().close();
});

test('la persona ingresa y solo puede cambiar la contraseña; después usa la app', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(person.email);
  await page.getByLabel(/Contraseña/).fill(ctx.initial);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // Pantalla obligatoria: sin menú de la app, solo cambiar o cerrar sesión.
  await expect(page).toHaveURL(/\/cambiar-contrasena/);
  await expect(page.getByRole('heading', { level: 1, name: 'Elegí tu contraseña' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await scanBothThemes(page, 'cambiar contraseña (obligatorio)');

  // Cualquier otra ruta de la app vuelve a esta pantalla.
  await page.goto('/objetivos');
  await expect(page).toHaveURL(/\/cambiar-contrasena/);

  // Validaciones: contraseña actual incorrecta, corta y que no coincide.
  const fill = async (current: string, next: string, again: string) => {
    await page.getByLabel(/Contraseña inicial/).fill(current);
    await page.getByLabel(/^Contraseña nueva/).fill(next);
    await page.getByLabel(/Repetí la contraseña nueva/).fill(again);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  };
  await fill(ctx.initial, 'corta', 'corta');
  await expect(page.getByText(/entre 12 y 200 caracteres/)).toBeVisible();
  await fill(ctx.initial, NEW_PASSWORD, `${NEW_PASSWORD} distinta`);
  await expect(page.getByText('Las dos contraseñas nuevas no coinciden.')).toBeVisible();
  await fill('Contraseña-incorrecta-1', NEW_PASSWORD, NEW_PASSWORD);
  await expect(
    page.getByRole('alert').filter({ hasText: /contraseña actual no es correcta/ }),
  ).toBeVisible();

  // Cambio correcto: entra a la app.
  await fill(ctx.initial, NEW_PASSWORD, NEW_PASSWORD);
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  await navLink(page, 'Objetivos').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Objetivos' })).toBeVisible();

  // La clave inicial ya no sirve; la nueva sí.
  const request = page.request;
  const old = await request.post(`${API}/auth/login`, {
    data: { email: person.email, password: ctx.initial },
  });
  expect(old.status()).toBe(401);
  const fresh = await request.post(`${API}/auth/login`, {
    data: { email: person.email, password: NEW_PASSWORD },
  });
  expect(fresh.ok()).toBeTruthy();
  expect((await fresh.json()).user.mustChangePassword).toBe(false);

  // Cambio voluntario desde el menú: pide la contraseña actual y deja de ser obligatorio.
  await page.getByRole('link', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cambiar contraseña' })).toBeVisible();
  await expect(page.getByLabel(/Contraseña actual/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  await scanBothThemes(page, 'cambiar contraseña (voluntario)');
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  await context.close();
});

test('un restablecimiento de administración también obliga a cambiarla', async ({
  browser,
  playwright,
}) => {
  const request = await playwright.request.newContext();
  const admin = await loginAdminApi(request);
  const users = await request.get(`${API}/users`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const id = ((await users.json()) as { id: string; email: string }[]).find(
    (u) => u.email === person.email,
  )!.id;

  const page = await adminSession(browser);
  await navLink(page, 'Usuarios').click();
  await page.getByRole('button', { name: `Restablecer la contraseña de ${person.name}` }).click();
  await dialog(page)
    .getByLabel(/Contraseña nueva/)
    .fill('Reseteada-por-admin-1');
  await dialog(page).getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.context().close();

  const session = await loginApi(request, person.email, 'Reseteada-por-admin-1');
  const me = await request.get(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect((await me.json()).mustChangePassword).toBe(true);
  expect(session.id).toBe(id);
  // Con la clave reseteada, el back bloquea todo menos el cambio.
  const blocked = await request.get(`${API}/objectives`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');
  await request.dispose();
});
