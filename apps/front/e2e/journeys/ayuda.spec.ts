import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  PASSWORD,
  adminSession,
  createUser,
  loginAdminApi,
  navLink,
  sessionFor,
  uniqueSuffix,
  type Session,
} from '../helpers';

/**
 * Ayuda dentro de la app (`/ayuda`): manuales generados en build desde `docs/manuales`.
 * Integrante: solo el manual de usuario (el de administración responde 404). Administración: ambos.
 * Enlaces profundos por ancla (con foco en el título), copiar enlace, búsqueda del lado del servidor,
 * capturas visibles y axe en claro/oscuro.
 */
const suffix = uniqueSuffix();
const member = { name: `Mia Ayuda ${suffix}`, email: `mia.ayuda.${suffix}@e2e.test` };
const DEEP_USER = 'cómo-ingreso-a-la-plataforma';
const DEEP_ADMIN = 'cómo-creo-un-usuario';

const ctx = { admin: {} as Session };

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

test.beforeAll(async ({ request }) => {
  ctx.admin = await loginAdminApi(request);
  await createUser(request, ctx.admin.token, member, 'MEMBER');
});

test('integrante: ve "Ayuda" en el menú, solo el manual de usuario y 404 en el de administración', async ({
  browser,
}) => {
  const page = await sessionFor(browser, member.email, PASSWORD);
  await navLink(page, 'Ayuda').click();
  await expect(page).toHaveURL(/\/ayuda$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ayuda' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Abrir el manual: Manual de usuario/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Manual de administración/ })).toHaveCount(0);

  await page.goto('/ayuda/admin');
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await expect(page.getByText('Cómo creo un usuario')).toHaveCount(0);
  await page.context().close();
});

test('integrante: abre el manual, usa el índice, el enlace profundo enfoca el título y copia el enlace', async ({
  browser,
}) => {
  const page = await sessionFor(browser, member.email, PASSWORD);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/ayuda');
  await page.getByRole('link', { name: /Abrir el manual: Manual de usuario/ }).click();
  await expect(page).toHaveURL(/\/ayuda\/usuario$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Manual de usuario');
  // Un integrante no tiene pestañas: solo hay un manual.
  await expect(page.getByRole('navigation', { name: 'Manuales' })).toHaveCount(0);

  // Índice -> ancla -> el foco va al título.
  const toc = page.getByRole('navigation', { name: 'Contenido del manual' });
  await toc.getByRole('link', { name: 'Cómo me muevo por la pantalla' }).click();
  await expect(page).toHaveURL(/#c%C3%B3mo-me-muevo-por-la-pantalla$/);
  await expect(
    page.getByRole('heading', { level: 3, name: /Cómo me muevo por la pantalla/ }),
  ).toBeFocused();

  // Enlace profundo directo (con tilde): carga, hace scroll y enfoca el título.
  await page.goto(`/ayuda/usuario#${DEEP_USER}`);
  const target = page.getByRole('heading', { level: 3, name: /Cómo ingreso a la plataforma/ });
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();

  // Copiar enlace: portapapeles + aviso.
  await page.getByRole('link', { name: 'Copiar enlace a «Cómo me muevo por la pantalla»' }).click();
  await expect(page.getByText('Enlace copiado.')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\/ayuda\/usuario#c%C3%B3mo-me-muevo-por-la-pantalla$/);

  // Las capturas del manual se ven (resuelven desde /ayuda/img).
  const shot = page.getByRole('img', { name: 'Pantalla de ingreso' });
  await shot.scrollIntoViewIfNeeded();
  await expect
    .poll(() => shot.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);

  // Salto de teclado al contenido.
  await page.goto('/ayuda/usuario');
  await page.getByRole('link', { name: 'Saltar al contenido del manual' }).focus();
  await expect(page.getByRole('link', { name: 'Saltar al contenido del manual' })).toBeVisible();
  await page.context().close();
});

test('búsqueda: resultados con enlace a la sección y nada del manual de administración para un integrante', async ({
  browser,
}) => {
  const page = await sessionFor(browser, member.email, PASSWORD);
  await page.goto('/ayuda');
  await page.getByRole('searchbox', { name: 'Buscar en la ayuda' }).fill('check-in');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/ayuda\?q=check-in/);
  const results = page.getByRole('region', { name: 'Resultados' });
  await expect(results).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'para «check-in»' })).toBeVisible();
  const first = results.getByRole('link').first();
  await expect(first).toHaveAttribute('href', /^\/ayuda\/usuario#/);

  // Algo exclusivo de administración no aparece para un integrante.
  await page
    .getByRole('searchbox', { name: 'Buscar en la ayuda' })
    .fill('restablezco una contraseña');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(
    page.getByText('No encontramos nada para «restablezco una contraseña».'),
  ).toBeVisible();

  await page.context().close();
});

test('administración: ve los dos manuales, cambia con las pestañas y entra por enlace profundo', async ({
  browser,
}) => {
  const page = await adminSession(browser);
  await navLink(page, 'Ayuda').click();
  await expect(
    page.getByRole('link', { name: /Abrir el manual: Manual de usuario/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Abrir el manual: Manual de administración/ }).click();
  await expect(page).toHaveURL(/\/ayuda\/admin$/);

  const tabs = page.getByRole('navigation', { name: 'Manuales' });
  await expect(tabs.getByRole('link', { name: 'Manual de administración' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await tabs.getByRole('link', { name: 'Manual de usuario' }).click();
  await expect(page).toHaveURL(/\/ayuda\/usuario$/);

  await page.goto(`/ayuda/admin#${DEEP_ADMIN}`);
  await expect(page.getByRole('heading', { level: 3, name: /Cómo creo un usuario/ })).toBeFocused();

  // Administración sí encuentra tareas de administración.
  await page.goto('/ayuda?q=contrase%C3%B1a');
  await expect(
    page
      .getByRole('region', { name: 'Resultados' })
      .getByRole('link', { name: /contraseña/i })
      .first(),
  ).toHaveAttribute('href', /\/ayuda\/(admin|usuario)#/);
  await page.context().close();
});

test('accesibilidad (axe, claro y oscuro): índice y manuales', async ({ browser }) => {
  const m = await sessionFor(browser, member.email, PASSWORD);
  for (const route of ['/ayuda', '/ayuda?q=check-in', '/ayuda/usuario']) {
    await m.goto(route);
    await m.waitForLoadState('networkidle');
    await scanBothThemes(m, `miembro ${route}`);
  }
  await m.context().close();

  const a = await adminSession(browser);
  await a.goto('/ayuda/admin');
  await a.waitForLoadState('networkidle');
  await scanBothThemes(a, 'admin /ayuda/admin');
  await a.context().close();
});
