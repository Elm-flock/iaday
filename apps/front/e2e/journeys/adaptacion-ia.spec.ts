import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN,
  PASSWORD,
  adminSession,
  api,
  createUser,
  loginAdminApi,
  navLink,
  seedActiveCycles,
  seedPublishedObjectives,
  sessionFor,
  uniqueSuffix,
  uniqueYear,
} from '../helpers';

/**
 * Ayuda de IA (accesibilidad cognitiva) de punta a punta: UI -> BFF -> back REAL -> agente STUB.
 *
 * El agente real necesita una API key de NVIDIA y respondería distinto en cada corrida, así que el stack e2e
 * (`scripts/e2e-stack.mjs`) levanta `e2e/helpers/agent-stub.mjs` (contrato v1, firma HMAC verificada, fixtures
 * del back) y el back habla con él. El stub se controla por `POST /__mode` para simular el agente caído.
 */
const AGENT = process.env.AGENT_STUB_URL ?? 'http://127.0.0.1:8089';
const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const people = {
  ana: { name: `Ana IA ${suffix}`, email: `ana.ia.${suffix}@e2e.test` },
  beto: { name: `Beto IA ${suffix}`, email: `beto.ia.${suffix}@e2e.test` },
};
const NOTE = `Ahora tardamos 5,5 h por la guía nueva ${suffix}`;
const FEEDBACK = `Ordenaste la reunión y ahorramos tiempo ${suffix}`;

const ctx = { cycleId: '', objectiveId: '', krTitle: '', feedbackId: '' };

async function setAgentMode(request: APIRequestContext, mode: string) {
  const response = await request.post(`${AGENT}/__mode`, { data: { mode } });
  expect(response.ok(), `stub ${mode}`).toBeTruthy();
}

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

test.describe('ayuda de IA: versión accesible, sugerencias y uso (agente stub)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    // Si el stack no levantó el stub (otro back, sin IA) el spec no puede correr: se avisa claro.
    const health = await request.get(`${AGENT}/health`).catch(() => null);
    expect(health?.ok(), `Agente stub en ${AGENT} (usá npm run test:e2e:stack)`).toBeTruthy();
    await setAgentMode(request, 'ok');

    const admin = await loginAdminApi(request);
    const { quarterId } = await seedActiveCycles(request, admin.token, YEAR, suffix);
    ctx.cycleId = quarterId;
    const ana = await createUser(request, admin.token, people.ana);
    const beto = await createUser(request, admin.token, people.beto);
    const [objective] = await seedPublishedObjectives(request, ana.token, {
      cycleId: quarterId,
      owner: { ownerUserId: ana.id },
      krOwnerId: ana.id,
      label: `Objetivo IA ${suffix}`,
    });
    ctx.objectiveId = objective.id;
    ctx.krTitle = objective.krs[0].title;
    await api(request, 'post', `/key-results/${objective.krs[0].id}/check-ins`, ana.token, {
      action: 'UPDATE',
      value: '55',
      note: NOTE,
    });
    const feedback = await api<{ id: string }>(request, 'post', '/feedback', beto.token, {
      toUserId: ana.id,
      content: FEEDBACK,
    });
    ctx.feedbackId = feedback.id;
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    await setAgentMode(request, 'ok').catch(() => undefined);
    await request.dispose();
  });

  test('check-in: pide lectura fácil, ve el badge de IA, marca "Me sirve" y pasa axe en claro y oscuro', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    const item = page.getByRole('listitem').filter({ hasText: NOTE }).filter({ visible: true });
    await item.getByRole('button', { name: 'Ver en lectura fácil' }).click();

    await expect(item.getByTestId('adapted-text')).toContainText(`Versión simple: ${NOTE}`);
    await expect(item.getByText('Generado por IA · pendiente de validación')).toBeVisible();
    // El texto original sigue ahí: la adaptación se suma, no reemplaza.
    await expect(item.getByText(NOTE, { exact: true })).toBeVisible();

    // La dueña (miembro) no puede validar: botón deshabilitado con la razón.
    const validate = item.getByRole('button', { name: 'Validar' });
    await expect(validate).toBeDisabled();
    await expect(validate).toHaveAccessibleDescription(/administración o el líder del equipo/);

    await item.getByRole('button', { name: 'Me sirve' }).click();
    await expect(item.getByText('Marcaste que esta versión te sirve.')).toBeVisible();

    await scanBothThemes(page, 'detalle de objetivo con versión accesible');
    await page.context().close();
  });

  test('administración valida con una corrección humana y queda "Validado por una persona"', async ({
    browser,
  }) => {
    const page = await adminSession(browser);
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    const item = page.getByRole('listitem').filter({ hasText: NOTE }).filter({ visible: true });
    await item.getByRole('button', { name: 'Ver en lectura fácil' }).click();
    // La versión ya existía (caché por texto de origen): la pidió Ana, así que ADMIN no ve "Me sirve".
    await expect(item.getByTestId('adapted-text')).toBeVisible();
    await expect(item.getByRole('button', { name: 'Me sirve' })).toHaveCount(0);

    await item.getByRole('button', { name: 'Validar', exact: true }).click();
    const blocks = item.getByLabel(/^Bloque \d/);
    const last = blocks.last();
    await last.fill(`Corrección humana ${suffix}`);
    await item.getByLabel(/^Nota de validación/).fill('Revisado con el equipo');
    await item.getByRole('button', { name: 'Validar versión' }).click();

    await expect(item.getByText('Validado por una persona')).toBeVisible();
    await expect(item.getByTestId('adapted-text')).toContainText(`Corrección humana ${suffix}`);
    await expect(item.getByRole('button', { name: 'Validar', exact: true })).toHaveCount(0);
    await page.context().close();
  });

  test('feedback: lenguaje claro para quien lo recibe; la validación no existe (privacidad)', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/feedback/${ctx.feedbackId}`);
    await expect(page.getByTestId('feedback-content')).toHaveText(FEEDBACK);
    await page.getByRole('button', { name: 'Ver en lenguaje claro' }).click();
    await expect(page.getByTestId('adapted-text')).toContainText(`Versión simple: ${FEEDBACK}`);
    const validate = page.getByRole('button', { name: 'Validar' });
    await expect(validate).toBeDisabled();
    await expect(validate).toHaveAccessibleDescription(/feedback es privado/);
    await scanBothThemes(page, 'detalle de feedback con versión accesible');
    await page.context().close();
  });

  test('agente caído: aviso no bloqueante y el resto de la página sigue funcionando', async ({
    browser,
    playwright,
  }) => {
    const control = await playwright.request.newContext();
    await setAgentMode(control, 'down');
    try {
      const page = await sessionFor(browser, people.ana.email, PASSWORD);
      await page.goto(`/objetivos/${ctx.objectiveId}`);
      const item = page.getByRole('listitem').filter({ hasText: NOTE }).filter({ visible: true });
      // Nivel "lenguaje claro": no está en la caché, así que el back sí llama al agente (caído).
      await item.getByRole('button', { name: 'Ver en lenguaje claro' }).click();
      await expect(item.getByTestId('ai-note')).toContainText(
        'La ayuda de IA no está disponible ahora. El resto de la plataforma funciona normal.',
      );
      // El texto original y la página siguen intactos.
      await expect(item.getByText(NOTE, { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(item.getByRole('button', { name: 'Ver en lectura fácil' })).toBeEnabled();
      await page.goto('/objetivos');
      await expect(page.getByRole('heading', { level: 1, name: 'Objetivos' })).toBeVisible();
      await page.context().close();
    } finally {
      await setAgentMode(control, 'ok');
      await control.dispose();
    }
  });

  test('sugerir redacción: la sugerencia se ve aparte, "Usar" precarga el formulario y nunca crea nada', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/nuevo?cycleId=${ctx.cycleId}`);
    await page.getByLabel(/^Título/).fill('mejorar soporte');
    await page.getByRole('button', { name: 'Sugerir redacción' }).click();

    const card = page.getByTestId('okr-suggestion');
    await expect(card).toContainText('Generado por IA');
    await expect(card).toContainText('Dar un soporte rápido y predecible en incidencias críticas');
    await expect(card.getByTestId('proposed-values').first()).toBeVisible();
    // Hasta que decide, el borrador de la persona no cambia.
    await expect(page.getByLabel(/^Título/)).toHaveValue('mejorar soporte');
    await scanBothThemes(page, 'formulario de objetivo con sugerencia');

    await card.getByRole('button', { name: 'Usar sugerencia' }).click();
    await expect(page.getByLabel(/^Título/)).toHaveValue(
      'Dar un soporte rápido y predecible en incidencias críticas',
    );
    // Precargó pero NO envió: seguimos en el formulario de alta.
    await expect(page).toHaveURL(/\/objetivos\/nuevo/);
    await page.context().close();
  });

  test('resumir check-ins: resumen con tendencia (ícono + palabra), destacados y riesgos', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    const section = page
      .getByRole('region', { name: `Historial de ${ctx.krTitle}` })
      .filter({ visible: true });
    await section.getByRole('button', { name: 'Resumir check-ins' }).click();
    const summary = section.getByTestId('checkin-summary');
    await expect(summary).toContainText('Generado por IA');
    await expect(summary.getByText('Mejorando')).toBeVisible();
    await expect(summary).toContainText('Lo destacado');
    await expect(summary).toContainText('Riesgos y bloqueos');
    await scanBothThemes(page, 'resumen de check-ins');
    await section.getByRole('button', { name: 'Me sirve' }).click();
    await expect(section.getByText('Gracias: anotamos que te sirvió.')).toBeVisible();
    await page.context().close();
  });

  test('admin/uso-ia: solo ADMIN, agregados con costo etiquetado como estimación y sin personas', async ({
    browser,
  }) => {
    // Miembro: el menú lo muestra deshabilitado con explicación y la URL directa da 404.
    const member = await sessionFor(browser, people.ana.email, PASSWORD);
    await expect(navLink(member, 'Uso de IA')).toHaveAttribute('aria-disabled', 'true');
    await member.goto('/admin/uso-ia');
    await expect(member.getByText('No encontramos esta página')).toBeVisible();
    await member.context().close();

    const page = await adminSession(browser);
    await navLink(page, 'Uso de IA').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Uso de IA' })).toBeVisible();
    await expect(page.getByText(/ESTIMACIÓN/).first()).toBeVisible();
    const byFeature = page.getByRole('table', { name: 'Uso por función' });
    await expect(byFeature.getByRole('rowheader', { name: 'Versión accesible' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Latencia p95' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Costo (estimado)' })).toBeVisible();
    // Agregado: ningún nombre de persona en la página.
    await expect(page.getByText(people.ana.name)).toHaveCount(0);
    await expect(page.getByText(ADMIN.name)).toHaveCount(1); // solo el menú de usuario

    await page.getByRole('link', { name: 'Últimos 7 días' }).click();
    await expect(page).toHaveURL(/dias=7/);
    await expect(page.getByRole('link', { name: 'Últimos 7 días' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await scanBothThemes(page, 'admin/uso-ia');
    await page.context().close();
  });
});
