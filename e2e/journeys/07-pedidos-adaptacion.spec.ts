import { spawnSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN,
  API,
  PASSWORD,
  adminSession,
  api,
  createUser,
  dialog,
  loginAdminApi,
  navLink,
  seedActiveCycles,
  seedPublishedObjectives,
  seedTeam,
  sessionFor,
  uniqueSuffix,
  uniqueYear,
  type Session,
} from '../helpers';

/**
 * Art. 14.5 RD 707/2026: pedir un documento adaptado a una PERSONA (no solo a la IA), de punta a punta:
 * UI -> BFF -> back REAL. Cubre: pedir y seguir el pedido, desde el panel de IA, vínculo a un feedback
 * (solo emisor/receptor), privacidad de los pedidos ajenos (404), gestión de administración
 * (asignar, entregar, rechazar con justificación obligatoria -> 422), resaltado de vencidos y la
 * pantalla de auditoría (sin texto libre ni feedback).
 */
const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const people = {
  ana: { name: `Ana Doc ${suffix}`, email: `ana.doc.${suffix}@e2e.test` },
  beto: { name: `Beto Doc ${suffix}`, email: `beto.doc.${suffix}@e2e.test` },
  carla: { name: `Carla Doc ${suffix}`, email: `carla.doc.${suffix}@e2e.test` },
  lia: { name: `Lia Doc ${suffix}`, email: `lia.doc.${suffix}@e2e.test` },
};
const SUBJECT = `Reporte del ciclo en audio ${suffix}`;
const SUBJECT_LINKED = `Objetivo en lectura fácil ${suffix}`;
const SUBJECT_FEEDBACK = `Feedback en lenguaje claro ${suffix}`;
const DETAIL = `Uso lector de pantalla y los PDF no se leen bien ${suffix}`;
const FEEDBACK_TEXT = `Contenido privado del feedback ${suffix}`;
const JUSTIFICATION = `Hoy no podemos grabarlo en audio porque exige un estudio externo ${suffix}.`;
const NOTE = `Te dejamos el reporte en lectura fácil ${suffix}`;
const LINK = 'https://docs.e2e.test/reporte-facil';

const ctx = {
  admin: {} as Session,
  ana: {} as Session,
  beto: {} as Session,
  carla: {} as Session,
  cycleId: '',
  teamId: '',
  objectiveId: '',
  feedbackId: '',
  requestIds: {} as Record<string, string>,
};

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

const raw = (
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch',
  path: string,
  token: string,
  data?: unknown,
) => request[method](`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, data });

/** Vence el plazo de un pedido directo en la base e2e (la API no permite fechas límite en el pasado). */
function backdate(requestId: string) {
  const container = spawnSync('docker', ['ps', '-q', '--filter', 'name=okr-e2e-front-db-test'], {
    encoding: 'utf8',
  }).stdout.trim();
  expect(container, 'contenedor db-test del stack e2e (usá npm run test:e2e:stack)').not.toBe('');
  const result = spawnSync(
    'docker',
    [
      'exec',
      container.split('\n')[0],
      'psql',
      '-U',
      'postgres',
      '-d',
      'okr-platform-test',
      '-c',
      `UPDATE "AdaptationRequest" SET "dueDate" = now() - interval '2 days' WHERE id = '${requestId}'`,
    ],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr).toBe(0);
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('pedidos de documento adaptado a una persona (art. 14.5)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    ctx.admin = await loginAdminApi(request);
    const { quarterId } = await seedActiveCycles(request, ctx.admin.token, YEAR, suffix);
    ctx.cycleId = quarterId;
    ctx.ana = await createUser(request, ctx.admin.token, people.ana);
    ctx.beto = await createUser(request, ctx.admin.token, people.beto);
    ctx.carla = await createUser(request, ctx.admin.token, people.carla);
    const lia = await createUser(request, ctx.admin.token, people.lia, 'LEADER');
    ctx.teamId = await seedTeam(request, ctx.admin.token, `Equipo Doc ${suffix}`, [
      { id: lia.id, lead: true },
      { id: ctx.ana.id },
    ]);
    const [objective] = await seedPublishedObjectives(request, ctx.ana.token, {
      cycleId: quarterId,
      owner: { ownerUserId: ctx.ana.id },
      krOwnerId: ctx.ana.id,
      label: `Objetivo Doc ${suffix}`,
    });
    ctx.objectiveId = objective.id;
    const feedback = await api<{ id: string }>(request, 'post', '/feedback', ctx.beto.token, {
      toUserId: ctx.ana.id,
      content: FEEDBACK_TEXT,
    });
    ctx.feedbackId = feedback.id;
    await request.dispose();
  });

  test('pedir desde el menú: vacío explicado, formulario, estado Pendiente con fecha límite y axe', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await navLink(page, 'Documentos adaptados').click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Documentos adaptados' }),
    ).toBeVisible();
    await expect(page.getByText('Todavía no pediste ningún documento')).toBeVisible();
    await scanBothThemes(page, 'documentos adaptados (vacío)');

    await page
      .getByRole('link', { name: 'Pedir un documento adaptado' })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pedir un documento adaptado' }),
    ).toBeVisible();

    // Validación en el front: sin asunto ni formato no se envía.
    await page.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page.getByText('Contá en pocas palabras qué necesitás.')).toBeVisible();
    await expect(page.getByText('Elegí el formato que te sirve.')).toBeVisible();
    await scanBothThemes(page, 'formulario de pedido con errores');

    await page.getByLabel(/^¿Qué documento necesitás\?/).fill(SUBJECT);
    await page.getByLabel(/^¿En qué formato te sirve\?/).selectOption('AUDIO');
    await page.getByLabel(/^Detalle/).fill(DETAIL);
    await page.getByRole('button', { name: 'Enviar pedido' }).click();

    await expect(page).toHaveURL(/\/pedidos-adaptacion\?creado=1/);
    await expect(page.getByText('Recibimos tu pedido.')).toBeVisible();
    const card = page.getByTestId('adaptation-request').filter({ hasText: SUBJECT });
    await expect(card.getByText('Pendiente', { exact: true })).toBeVisible();
    await expect(card.getByText('Fecha límite', { exact: true })).toBeVisible();
    await expect(card).toContainText('Audio');
    await expect(card).toContainText(DETAIL);
    await scanBothThemes(page, 'mis pedidos con un pedido pendiente');

    const mine = await api<{ items: { id: string; subject: string }[] }>(
      page.context().request,
      'get',
      '/adaptation-requests/mine',
      ctx.ana.token,
    );
    ctx.requestIds.audio = mine.items.find((i) => i.subject === SUBJECT)!.id;
    await page.context().close();
  });

  test('desde el panel de IA (objetivo): "Pedilo a una persona" va vinculado al objetivo', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    // Con la IA apagada el panel no se ofrece; en el stack e2e está activa.
    await page
      .getByRole('link', { name: 'Pedilo a una persona' })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/pedidos-adaptacion\/nuevo\?tipo=objective&id=/);
    await expect(page.getByText('Este pedido va vinculado a un objetivo.')).toBeVisible();
    await page.getByLabel(/^¿Qué documento necesitás\?/).fill(SUBJECT_LINKED);
    await page.getByLabel(/^¿En qué formato te sirve\?/).selectOption('LECTURA_FACIL');
    await page.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page).toHaveURL(/\/pedidos-adaptacion\?creado=1/);
    const card = page.getByTestId('adaptation-request').filter({ hasText: SUBJECT_LINKED });
    await expect(card).toContainText('Vinculado a');
    await expect(card).toContainText('un objetivo');
    await page.context().close();
  });

  test('feedback: quien lo recibió lo vincula desde el panel; un tercero y ADMIN reciben 404 (API)', async ({
    browser,
    playwright,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/feedback/${ctx.feedbackId}`);
    await page
      .getByRole('link', { name: 'Pedilo a una persona' })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByText(/Este pedido va vinculado a un feedback tuyo/)).toBeVisible();
    await expect(page.getByText(/Administración no puede leer tu feedback/)).toBeVisible();
    await page.getByLabel(/^¿Qué documento necesitás\?/).fill(SUBJECT_FEEDBACK);
    await page.getByLabel(/^¿En qué formato te sirve\?/).selectOption('LENGUAJE_CLARO');
    await page.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page).toHaveURL(/\/pedidos-adaptacion\?creado=1/);
    await expect(
      page.getByTestId('adaptation-request').filter({ hasText: SUBJECT_FEEDBACK }),
    ).toContainText('un feedback tuyo');
    await page.context().close();

    const request = await playwright.request.newContext();
    const body = {
      subject: 'Intento sobre feedback ajeno',
      preferredFormat: 'LENGUAJE_CLARO',
      entityType: 'FEEDBACK',
      entityId: ctx.feedbackId,
    };
    // Carla (tercera) y ADMIN: 404, igual que un feedback inexistente (sin bypass).
    expect(
      (await raw(request, 'post', '/adaptation-requests', ctx.carla.token, body)).status(),
    ).toBe(404);
    expect(
      (await raw(request, 'post', '/adaptation-requests', ctx.admin.token, body)).status(),
    ).toBe(404);
    // Beto lo envió: puede vincularlo.
    expect(
      (await raw(request, 'post', '/adaptation-requests', ctx.beto.token, body)).status(),
    ).toBe(201);
    await request.dispose();
  });

  test('privacidad: otra persona no ve el pedido (404), ni el listado general (403) ni la sección admin', async ({
    browser,
    playwright,
  }) => {
    const request = await playwright.request.newContext();
    const id = ctx.requestIds.audio;
    expect((await raw(request, 'get', `/adaptation-requests/${id}`, ctx.beto.token)).status()).toBe(
      404,
    );
    expect((await raw(request, 'get', `/adaptation-requests/${id}`, ctx.ana.token)).status()).toBe(
      200,
    );
    expect((await raw(request, 'get', '/adaptation-requests', ctx.beto.token)).status()).toBe(403);
    expect(
      (
        await raw(request, 'patch', `/adaptation-requests/${id}/assign`, ctx.beto.token, {
          assigneeId: ctx.admin.id,
        })
      ).status(),
    ).toBe(403);
    // Administración no recibe el id del feedback vinculado.
    const all = await api<{ items: { entityType: string | null; entityId: string | null }[] }>(
      request,
      'get',
      '/adaptation-requests',
      ctx.admin.token,
    );
    const fb = all.items.filter((i) => i.entityType === 'FEEDBACK');
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.every((i) => i.entityId === null)).toBe(true);
    await request.dispose();

    // UI: la sección admin da 404 y el menú la muestra deshabilitada con explicación.
    const beto = await sessionFor(browser, people.beto.email, PASSWORD);
    await expect(navLink(beto, 'Pedidos de adaptación')).toHaveAttribute('aria-disabled', 'true');
    await beto.goto('/admin/pedidos-adaptacion');
    await expect(beto.getByText('No encontramos esta página')).toBeVisible();
    await beto.goto('/admin/auditoria');
    await expect(beto.getByText('No encontramos esta página')).toBeVisible();
    // Y en "Mis pedidos" de Beto no aparece lo de Ana.
    await beto.goto('/pedidos-adaptacion');
    await expect(beto.getByText(SUBJECT, { exact: true })).toHaveCount(0);
    await beto.context().close();
  });

  test('admin: lista, resalta vencidos (ícono + palabra), rechazo sin justificación = error y 422 del back', async ({
    browser,
    playwright,
  }) => {
    backdate(ctx.requestIds.audio);
    const page = await adminSession(browser);
    await navLink(page, 'Pedidos de adaptación').click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pedidos de adaptación' }),
    ).toBeVisible();

    const row = page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT });
    await expect(row).toHaveAttribute('data-overdue', 'true');
    await expect(row.getByText('Vencido', { exact: true })).toBeVisible();
    await expect(row.getByText('Pendiente', { exact: true })).toBeVisible();
    await expect(row).toContainText(people.ana.name);
    // Un pedido en fecha no se marca.
    const onTime = page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT_LINKED });
    await expect(onTime).not.toHaveAttribute('data-overdue', 'true');
    // El feedback vinculado se ve como privado.
    await expect(
      page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT_FEEDBACK }).first(),
    ).toContainText('privado: administración no lo puede leer');
    await scanBothThemes(page, 'pedidos de adaptación (admin) con un vencido');

    // Filtro "Vencidos": solo el atrasado.
    await page.getByRole('link', { name: 'Vencidos' }).click();
    await expect(page).toHaveURL(/vencidos=1/);
    await expect(
      page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT }),
    ).toBeVisible();
    await expect(
      page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT_LINKED }),
    ).toHaveCount(0);

    // Rechazar sin justificación: el formulario lo frena con un mensaje claro.
    await page
      .getByTestId('admin-adaptation-request')
      .filter({ hasText: SUBJECT })
      .getByRole('button', { name: 'Rechazar' })
      .click();
    await dialog(page).getByRole('button', { name: 'Rechazar pedido' }).click();
    await expect(
      dialog(page)
        .getByText(/justificación por escrito/)
        .first(),
    ).toBeVisible();
    await expect(dialog(page)).toBeVisible();
    await scanBothThemes(page, 'diálogo de rechazo con error');

    // El back también lo exige: 422 con código (aunque alguien salteara el formulario).
    const request = await playwright.request.newContext();
    const noJustification = await raw(
      request,
      'post',
      `/adaptation-requests/${ctx.requestIds.audio}/reject`,
      ctx.admin.token,
      {},
    );
    expect(noJustification.status()).toBe(422);
    expect((await noJustification.json()).code).toBe('ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED');
    await request.dispose();

    // Con justificación: rechaza y desaparece de "Vencidos" (resuelto no vence).
    await dialog(page)
      .getByLabel(/^Justificación/)
      .fill(JUSTIFICATION);
    await dialog(page).getByRole('button', { name: 'Rechazar pedido' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(
      page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT }),
    ).toHaveCount(0);
    await page.context().close();
  });

  test('admin asigna y entrega el otro pedido; la persona ve el estado, la nota y el enlace', async ({
    browser,
  }) => {
    const page = await adminSession(browser);
    await page.goto('/admin/pedidos-adaptacion?estado=PENDIENTE');
    const row = () =>
      page.getByTestId('admin-adaptation-request').filter({ hasText: SUBJECT_LINKED });
    await row().getByRole('button', { name: 'Asignar' }).click();
    await dialog(page).getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);

    await page.goto('/admin/pedidos-adaptacion?estado=EN_CURSO');
    await expect(row().getByText('En curso', { exact: true })).toBeVisible();
    await expect(row()).toContainText(ADMIN.name);

    // Nota demasiado corta: error claro y el pedido no cambia.
    await row().getByRole('button', { name: 'Entregar' }).click();
    await dialog(page)
      .getByLabel(/^Nota de entrega/)
      .fill('corta');
    await dialog(page).getByRole('button', { name: 'Marcar como entregado' }).click();
    await expect(
      dialog(page)
        .getByText(/al menos 10 caracteres/)
        .first(),
    ).toBeVisible();
    await dialog(page)
      .getByLabel(/^Nota de entrega/)
      .fill(NOTE);
    await dialog(page)
      .getByLabel(/^Enlace al documento/)
      .fill(LINK);
    await dialog(page).getByRole('button', { name: 'Marcar como entregado' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.context().close();

    const ana = await sessionFor(browser, people.ana.email, PASSWORD);
    await ana.goto('/pedidos-adaptacion');
    const delivered = ana.getByTestId('adaptation-request').filter({ hasText: SUBJECT_LINKED });
    await expect(delivered.getByText('Entregada', { exact: true })).toBeVisible();
    await expect(delivered).toContainText(NOTE);
    await expect(
      delivered.getByRole('link', { name: /Abrir el documento adaptado/ }),
    ).toHaveAttribute('href', LINK);

    const rejected = ana.getByTestId('adaptation-request').filter({ hasText: SUBJECT });
    await expect(rejected.getByText('Rechazada', { exact: true })).toBeVisible();
    await expect(rejected.getByText('Por qué no pudimos hacerlo')).toBeVisible();
    await expect(rejected).toContainText(JUSTIFICATION);
    await scanBothThemes(ana, 'mis pedidos resueltos (entregado y rechazado)');
    await ana.context().close();
  });

  test('auditoría: ADMIN ve acciones en español, nombres y cambios; sin texto libre ni feedback; filtra por acción', async ({
    browser,
  }) => {
    const page = await adminSession(browser);
    await navLink(page, 'Auditoría').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
    // Filtros (formulario GET: la URL conserva el filtro). Por persona y acción para no depender del resto.
    await page.getByRole('combobox', { name: 'Quién' }).selectOption({ label: people.ana.name });
    await page
      .getByRole('combobox', { name: 'Acción' })
      .selectOption({ label: 'Pedido de documento adaptado creado' });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/accion=ADAPTATION_REQUEST_CREATED/);
    const table = page.getByRole('table', { name: /Registro de auditoría/ });
    const created = table
      .getByRole('row')
      .filter({ hasText: 'Pedido de documento adaptado creado' });
    await expect(created.first()).toContainText(people.ana.name);
    await expect(created.first()).toContainText('Pedido de documento adaptado');
    await expect(created.first()).toContainText('Estado:');
    await expect(created.first()).toContainText('Pendiente');

    await page.getByRole('combobox', { name: 'Quién' }).selectOption({ label: ADMIN.name });
    await page
      .getByRole('combobox', { name: 'Acción' })
      .selectOption({ label: 'Pedido de documento adaptado rechazado' });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/accion=ADAPTATION_REQUEST_REJECTED/);
    const rejected = page
      .getByRole('row')
      .filter({ hasText: 'Pedido de documento adaptado rechazado' });
    await expect(rejected.first()).toContainText(ADMIN.name);
    await expect(rejected.first()).toContainText('Rechazada');
    await expect(
      page.getByRole('row').filter({ hasText: 'Pedido de documento adaptado creado' }),
    ).toHaveCount(0);

    // Privacidad: ni el asunto, ni el detalle, ni la justificación, ni el feedback aparecen en la auditoría.
    await page.getByRole('link', { name: 'Quitar filtros' }).click();
    for (const secret of [SUBJECT, SUBJECT_LINKED, DETAIL, JUSTIFICATION, NOTE, FEEDBACK_TEXT]) {
      await expect(page.getByText(secret, { exact: false })).toHaveCount(0);
    }
    await scanBothThemes(page, 'auditoría');
    await page.context().close();
  });

  test('roles: "Líder" (rol global) y "Líder del equipo" (isLead) se nombran distinto', async ({
    browser,
  }) => {
    const page = await adminSession(browser);
    await page.goto('/admin/usuarios');
    const lia = page.getByRole('row').filter({ hasText: people.lia.name });
    await expect(lia.getByText('Líder', { exact: true })).toBeVisible();
    await expect(page.getByText('Liderazgo')).toHaveCount(0);
    await page.goto(`/equipos/${ctx.teamId}?cycleId=${ctx.cycleId}`);
    await expect(page.getByText('Líder del equipo', { exact: true }).first()).toBeVisible();
    await page.context().close();
  });
});
