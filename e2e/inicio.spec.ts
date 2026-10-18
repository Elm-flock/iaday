import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  ADMIN,
  onboardUser,
  PASSWORD,
  SHOTS,
  api,
  loginApi,
  uniqueSuffix,
  uniqueYear,
} from './helpers';

// Requiere el back real con un admin sembrado (ver CLAUDE.md > Testing). Los datos se preparan por API;
// el dashboard y el check-in que actualiza el card de pendientes se recorren por la UI. El "vencido" se
// siembra retrasando `publishedAt` en la base e2e (contenedor `okr-e2e-front`, nunca otra).
const E2E_DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? 'okr-e2e-front-db-test-1';

const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const people = {
  ana: { name: `Ana Inicio ${suffix}`, email: `ana.inicio.${suffix}@e2e.test`, role: 'MEMBER' },
  leo: { name: `Leo Inicio ${suffix}`, email: `leo.inicio.${suffix}@e2e.test`, role: 'LEADER' },
  carla: {
    name: `Carla Inicio ${suffix}`,
    email: `carla.inicio.${suffix}@e2e.test`,
    role: 'MEMBER',
  },
} as const;
type Who = keyof typeof people;

const teamName = `Equipo Inicio ${suffix}`;
const FEEDBACK_SECRET = `contenido-privado-${suffix}`;
const RECOGNITION_MESSAGE = `Gran trabajo con el cierre ${suffix}`;

const ctx = {
  cycleId: '',
  tokens: {} as Record<Who, string>,
  ids: {} as Record<Who, string>,
  overdueObjective: { id: '', title: '', krTitle: '' },
};

async function sessionFor(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  return page;
}

function backdatePublication(objectiveId: string, days: number) {
  execFileSync('docker', [
    'exec',
    E2E_DB_CONTAINER,
    'psql',
    '-U',
    'postgres',
    '-d',
    'okr-platform-test',
    '-c',
    `UPDATE "Objective" SET "publishedAt" = now() - interval '${days} days' WHERE id = '${objectiveId}'`,
  ]);
}

/** Cantidad de acciones primarias visibles en el contenido (enlaces o botones con el fondo primario). */
const primaryActions = (page: Page) =>
  page.getByRole('main').locator('a.bg-primary, button.bg-primary').filter({ visible: true });

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('Inicio / dashboard (contra el back real)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginApi(request, ADMIN.email, ADMIN.password);
    const cycleBody = {
      checkInCadence: 'WEEKLY',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    };
    const annual = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `OKR ${YEAR} inicio ${suffix}`,
      kind: 'ANNUAL',
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
      ...cycleBody,
    });
    const quarter = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `Q1 ${YEAR} inicio ${suffix}`,
      kind: 'QUARTER',
      parentId: annual.id,
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-03-31`,
      ...cycleBody,
    });
    await api(request, 'post', `/cycles/${annual.id}/activate`, admin.token);
    await api(request, 'post', `/cycles/${quarter.id}/activate`, admin.token);
    ctx.cycleId = quarter.id;

    for (const who of Object.keys(people) as Who[]) {
      await onboardUser(request, admin.token, { ...people[who] });
      const session = await loginApi(request, people[who].email, PASSWORD);
      ctx.ids[who] = session.id;
      ctx.tokens[who] = session.token;
    }

    // Equipo con Leo de líder y Ana de integrante (Carla queda afuera, sin nada).
    const tree = await api<{ id: string }[]>(request, 'get', '/teams', admin.token);
    const team = await api<{ id: string }>(request, 'post', '/teams', admin.token, {
      name: teamName,
      parentId: tree[0].id,
    });
    await api(request, 'put', `/teams/${team.id}/members/${ctx.ids.leo}`, admin.token, {
      isLead: true,
    });
    await api(request, 'put', `/teams/${team.id}/members/${ctx.ids.ana}`, admin.token, {});

    // Ana: 4 objetivos publicados (2 top-down + 2 bottom-up => 50/50) con 3 KRs numéricos cada uno.
    const origins = ['BOTTOM_UP', 'BOTTOM_UP', 'TOP_DOWN', 'TOP_DOWN'] as const;
    const created: { id: string; title: string; krs: { id: string; title: string }[] }[] = [];
    for (const [i, origin] of origins.entries()) {
      const title = `Objetivo Inicio ${i + 1} ${suffix}`;
      const objective = await api<{ id: string }>(request, 'post', '/objectives', ctx.tokens.ana, {
        cycleId: ctx.cycleId,
        ownerUserId: ctx.ids.ana,
        title,
        type: 'COMMITTED',
        origin,
      });
      const krs: { id: string; title: string }[] = [];
      for (const k of [1, 2, 3]) {
        const krTitle = `KR Inicio ${i + 1}.${k} ${suffix}`;
        const kr = await api<{ id: string }>(
          request,
          'post',
          `/objectives/${objective.id}/key-results`,
          ctx.tokens.ana,
          {
            title: krTitle,
            scoring: 'DERIVED',
            startValue: '0',
            targetValue: '100',
            unit: 'clientes',
            ownerId: ctx.ids.ana,
          },
        );
        krs.push({ id: kr.id, title: krTitle });
      }
      created.push({ id: objective.id, title, krs });
    }
    for (const o of created)
      await api(request, 'post', `/objectives/${o.id}/publish`, ctx.tokens.ana);

    // Objetivo 1: dos KRs con check-in reciente y UNO vencido (publicación retrasada 30 días, cadencia semanal).
    const [first] = created;
    for (const kr of first.krs.slice(1)) {
      await api(request, 'post', `/key-results/${kr.id}/check-ins`, ctx.tokens.ana, {
        action: 'UPDATE',
        value: '80',
      });
    }
    backdatePublication(first.id, 30);
    ctx.overdueObjective = { id: first.id, title: first.title, krTitle: first.krs[0].title };

    // Feedback de Leo a Ana (nunca debe verse su contenido) y reconocimiento de Leo a Ana.
    await api(request, 'post', '/feedback', ctx.tokens.leo, {
      toUserId: ctx.ids.ana,
      content: FEEDBACK_SECRET,
    });
    await api(request, 'post', '/recognitions', ctx.tokens.leo, {
      toUserId: ctx.ids.ana,
      message: RECOGNITION_MESSAGE,
    });
    await request.dispose();
  });

  test('miembro con objetivos publicados y un KR vencido ve las cards pobladas; el check-in actualiza pendientes', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/?cycleId=${ctx.cycleId}`);

    // Mis objetivos: 4 con badge, barra y "N de M KRs con check-in".
    const mine = page.getByRole('region', { name: 'Objetivos individuales' });
    await expect(mine.getByRole('link')).toHaveCount(4);
    const overdueRow = mine.getByRole('link', { name: new RegExp(ctx.overdueObjective.title) });
    await expect(overdueRow).toContainText('2 de 3 KRs con check-in');
    await expect(overdueRow).toContainText(/En ruta|Requiere atención|En riesgo/);
    await expect(overdueRow.getByRole('meter')).toBeVisible();
    const untouched = mine.getByRole('link', { name: new RegExp(`Objetivo Inicio 2 ${suffix}`) });
    await expect(untouched).toContainText('Sin check-ins');
    await expect(untouched).toContainText('0 de 3 KRs con check-in');
    await expect(untouched.getByRole('meter')).toHaveCount(0);

    // Pendientes: exactamente el KR vencido, con su badge, y la primaria "Registrar check-in".
    const pending = page.getByRole('region', { name: 'Check-ins pendientes' });
    await expect(pending.getByTestId('pending-count')).toHaveText('1 vencido');
    await expect(pending).toContainText(ctx.overdueObjective.krTitle);
    await expect(pending.getByText('Check-in vencido')).toBeVisible();
    await expect(primaryActions(page)).toHaveCount(1);
    await expect(primaryActions(page)).toHaveText('Registrar check-in');
    // Nav: contador de pendientes junto a Check-ins.
    await expect(page.getByRole('link', { name: /Check-ins/ })).toContainText('1 pendiente');

    // Reconocimientos: el que recibió, y en el muro; sin conteos.
    const recognitions = page.getByRole('region', { name: 'Reconocimientos recientes' });
    await expect(
      recognitions.getByRole('region', { name: 'Para vos' }).getByText(RECOGNITION_MESSAGE),
    ).toBeVisible();

    // Feedback: solo el conteo, jamás contenido ni remitente.
    await expect(page.getByText('Tenés 1 feedback sin leer.')).toBeVisible();
    await expect(page.getByText(FEEDBACK_SECRET)).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/inicio-miembro.png`, fullPage: true });

    // Sin permiso a nada ajeno: no hay Mis equipos ni gestión para un miembro.
    await expect(page.getByRole('heading', { name: 'Mis equipos' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Gestión' })).toHaveCount(0);

    // Check-in del KR vencido por la UI: pendientes pasa a "al día".
    await page.goto(`/objetivos/${ctx.overdueObjective.id}`);
    await page
      .getByRole('button', { name: `Registrar check-in de ${ctx.overdueObjective.krTitle}` })
      .click();
    const drawer = page.getByRole('dialog', { name: 'Registrar check-in' });
    await drawer.getByLabel(/^Valor actual/).fill('60');
    await drawer.getByRole('button', { name: 'Registrar check-in' }).click();
    await expect(
      page.getByRole('row', { name: new RegExp(ctx.overdueObjective.krTitle) }),
    ).not.toContainText('Check-in vencido');

    await page.goto(`/?cycleId=${ctx.cycleId}`);
    await expect(page.getByText('Estás al día con tus check-ins.')).toBeVisible();
    await expect(page.getByTestId('pending-count')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: new RegExp(ctx.overdueObjective.title) }),
    ).toContainText('3 de 3 KRs con check-in');
    await expect(page.getByTestId('nav-count')).toHaveCount(0);
    // Sin pendientes y con objetivos: ninguna acción primaria.
    await expect(primaryActions(page)).toHaveCount(0);
    await page.context().close();
  });

  test('líder ve "Mis equipos" con el 50/50 y el enlace al equipo; sin objetivos propios crea el primero', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.leo.email, PASSWORD);
    await page.goto(`/?cycleId=${ctx.cycleId}`);

    const teams = page.getByRole('region', { name: 'Mis equipos' });
    const link = teams.getByRole('link', { name: new RegExp(teamName) });
    await expect(link).toBeVisible();
    await expect(link).toContainText('Top-down 50 % · Bottom-up 50 %');
    await expect(link).toContainText('Equilibrado');
    await expect(link).toHaveAttribute('href', new RegExp(`/equipos/.+\\?cycleId=${ctx.cycleId}`));
    await expect(page.getByRole('heading', { name: 'Gestión' })).toHaveCount(0);

    // Leo no tiene objetivos ni pendientes: la primaria es "Crear objetivo" (única).
    await expect(page.getByText('Todavía no tenés objetivos en este ciclo')).toBeVisible();
    await expect(primaryActions(page)).toHaveCount(1);
    await expect(primaryActions(page)).toHaveText('Crear objetivo');
    await page.screenshot({ path: `${SHOTS}/inicio-lider.png`, fullPage: true });

    await link.click();
    await expect(page).toHaveURL(/\/equipos\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();
    await page.context().close();
  });

  test('admin ve los accesos de gestión y el estado del ciclo activo', async ({ browser }) => {
    const page = await sessionFor(browser, ADMIN.email, ADMIN.password);
    const card = page.getByRole('region', { name: 'Gestión' });
    await expect(card.getByText('Ciclo activo')).toBeVisible();
    const links = card.getByRole('navigation', { name: 'Accesos de administración' });
    await expect(links.getByRole('link', { name: 'Ciclos' })).toHaveAttribute('href', '/ciclos');
    await expect(links.getByRole('link', { name: 'Equipos' })).toHaveAttribute('href', '/equipos');
    await expect(links.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    await page.context().close();
  });

  test('miembro sin nada ve los estados vacíos con una única acción primaria', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.carla.email, PASSWORD);
    await page.goto(`/?cycleId=${ctx.cycleId}`);

    await expect(page.getByText('Todavía no tenés objetivos en este ciclo')).toBeVisible();
    await expect(page.getByText('Estás al día con tus check-ins.')).toBeVisible();
    await expect(page.getByText('Todavía no recibiste reconocimientos.')).toBeVisible();
    await expect(page.getByText(/feedback sin leer/)).toHaveCount(0);
    await expect(primaryActions(page)).toHaveCount(1);
    await expect(primaryActions(page)).toHaveText('Crear objetivo');
    await expect(page.getByTestId('nav-count')).toHaveCount(0);

    await primaryActions(page).click();
    await expect(page).toHaveURL(new RegExp(`/objetivos/nuevo\\?cycleId=${ctx.cycleId}`));
    await page.context().close();
  });
});
