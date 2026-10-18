import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  onboardUser,
  PASSWORD,
  SHOTS,
  loginApi,
  loginUi as login,
  navLink,
  uniqueSuffix,
  uniqueYear,
  api,
} from './helpers';

// Requiere el back real con un admin sembrado (ver CLAUDE.md > Testing). Los datos se preparan por API y los
// flujos de check-ins se recorren por la UI. El "vencido" se siembra retrasando `publishedAt` en la base e2e.
const E2E_DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? 'okr-e2e-front-db-test-1';

const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const ana = { name: `Ana ${suffix}`, email: `ana.${suffix}@e2e.test` };

type Kr = { id: string; title: string };
type Obj = { id: string; title: string; krs: Kr[] };
const ctx: { cycleId: string; ana: { token: string; id: string }; objectives: Obj[] } = {
  cycleId: '',
  ana: { token: '', id: '' },
  objectives: [],
};

/** Solo contra la base efímera del e2e (contenedor `okr-e2e-front`), nunca otra. */
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

const drawer = (page: Page) => page.getByRole('dialog', { name: 'Registrar check-in' });
const checkInButton = (page: Page, krTitle: string) =>
  page.getByRole('button', { name: `Registrar check-in de ${krTitle}` });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('check-ins (contra el back real)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginApi(request, ADMIN.email, ADMIN.password);
    const cycleBody = {
      checkInCadence: 'WEEKLY',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    };
    const annual = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `OKR ${YEAR} ${suffix}`,
      kind: 'ANNUAL',
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
      ...cycleBody,
    });
    const quarter = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `Q1 ${YEAR} ${suffix}`,
      kind: 'QUARTER',
      parentId: annual.id,
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-03-31`,
      ...cycleBody,
    });
    await api(request, 'post', `/cycles/${annual.id}/activate`, admin.token);
    await api(request, 'post', `/cycles/${quarter.id}/activate`, admin.token);
    ctx.cycleId = quarter.id;
    await onboardUser(request, admin.token, { ...ana, role: 'MEMBER' });
    ctx.ana = await loginApi(request, ana.email, PASSWORD);

    // 3 objetivos de Ana con 3 KRs cada uno: numérico, numérico con meta menor al inicio y manual.
    for (const n of [1, 2, 3]) {
      const title = `Objetivo ${n} ${suffix}`;
      const objective = await api<{ id: string }>(request, 'post', '/objectives', ctx.ana.token, {
        cycleId: ctx.cycleId,
        ownerUserId: ctx.ana.id,
        title,
        type: 'COMMITTED',
        origin: 'BOTTOM_UP',
      });
      const defs = [
        {
          title: `Clientes ${n} ${suffix}`,
          scoring: 'DERIVED',
          startValue: '0',
          targetValue: '100',
          unit: 'clientes',
        },
        {
          title: `Costos ${n} ${suffix}`,
          scoring: 'DERIVED',
          startValue: '100',
          targetValue: '0',
          unit: 'USD',
        },
        { title: `Hito ${n} ${suffix}`, scoring: 'MANUAL' },
      ];
      const krs: Kr[] = [];
      for (const def of defs) {
        const kr = await api<{ id: string }>(
          request,
          'post',
          `/objectives/${objective.id}/key-results`,
          ctx.ana.token,
          { ...def, ownerId: ctx.ana.id },
        );
        krs.push({ id: kr.id, title: def.title });
      }
      ctx.objectives.push({ id: objective.id, title, krs });
    }
    await request.dispose();
  });

  test('un miembro publica el objetivo y ve "Sin check-ins" en lugar de una banda', async ({
    page,
    request,
  }) => {
    await login(page, ana.email, PASSWORD);
    const [first, second, third] = ctx.objectives;

    await page.goto(`/objetivos/${first.id}`);
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar objetivo' }).click();
    await expect(page.getByText('Publicado', { exact: true }).first()).toBeVisible();
    // Los otros dos se publican por API (solo se prepara el escenario).
    for (const o of [second, third]) {
      await api(request, 'post', `/objectives/${o.id}/publish`, ctx.ana.token);
    }

    await page.goto(`/objetivos/${first.id}`);
    for (const kr of first.krs) {
      await expect(page.getByRole('row', { name: new RegExp(kr.title) })).toContainText(
        'Sin check-ins',
      );
    }
    await expect(page.getByText(/En ruta|Requiere atención|En riesgo/)).toHaveCount(0);
    await expect(page.getByRole('meter')).toHaveCount(0);
    await expect(page.getByText('Todavía no hay check-ins.')).toHaveCount(3);

    await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
    await expect(page.getByText('Sin check-ins').first()).toBeVisible();
    await expect(page.getByText(/En riesgo/)).toHaveCount(0);
  });

  test('registra un check-in numérico: preview, banda y score del objetivo se actualizan', async ({
    page,
  }) => {
    await login(page, ana.email, PASSWORD);
    const first = ctx.objectives[0];
    await page.goto(`/objetivos/${first.id}`);

    await checkInButton(page, first.krs[0].title).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText('Seguimos igual')).toBeVisible();

    await drawer(page)
      .getByLabel(/^Valor actual/)
      .fill('70');
    await expect(page.getByTestId('check-in-preview')).toContainText('En ruta');
    await expect(page.getByTestId('check-in-preview')).toContainText('0,70');
    await drawer(page).getByLabel(/^Nota/).fill('Cerramos dos cuentas grandes');
    await page.screenshot({ path: `${SHOTS}/check-in-drawer.png` });
    // Validación: sin valor no se llama al back y lo demás se conserva.
    await drawer(page)
      .getByLabel(/^Valor actual/)
      .fill('');
    await drawer(page).getByRole('button', { name: 'Registrar check-in' }).click();
    await expect(drawer(page).getByText(/Ingresá el valor actual como número/)).toBeVisible();
    await expect(drawer(page).getByLabel(/^Nota/)).toHaveValue('Cerramos dos cuentas grandes');
    await drawer(page)
      .getByLabel(/^Valor actual/)
      .fill('70');
    await drawer(page).getByRole('button', { name: 'Registrar check-in' }).click();

    const row = page.getByRole('row', { name: new RegExp(first.krs[0].title) });
    await expect(row).toContainText('En ruta');
    await expect(row).not.toContainText('Sin check-ins');
    // Los otros KRs siguen neutros y el objetivo promedia sus 3 KRs: (0,7 + 0 + 0) / 3 = 0,23.
    await expect(page.getByRole('row', { name: new RegExp(first.krs[1].title) })).toContainText(
      'Sin check-ins',
    );
    await expect(page.getByRole('meter', { name: `Score de ${first.title}` })).toHaveAttribute(
      'aria-valuetext',
      '0,23',
    );

    // Historial: fecha dd/mm/aaaa hh:mm, autor, acción, valor → score, banda y nota.
    const history = page.getByRole('region', { name: `Historial de ${first.krs[0].title}` });
    await expect(history).toContainText(ana.name);
    await expect(history).toContainText('Actualizar');
    await expect(history).toContainText('70 clientes');
    await expect(history).toContainText('Score 0,70');
    await expect(history).toContainText('Cerramos dos cuentas grandes');
    await expect(history).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  test('KR con meta menor al inicio y KR manual', async ({ page }) => {
    await login(page, ana.email, PASSWORD);
    const first = ctx.objectives[0];
    await page.goto(`/objetivos/${first.id}`);

    // Costos: de 100 a 0; con 30 el avance es 0,70.
    await checkInButton(page, first.krs[1].title).click();
    await drawer(page)
      .getByLabel(/^Valor actual/)
      .fill('30');
    await expect(page.getByTestId('check-in-preview')).toContainText('0,70');
    await drawer(page)
      .getByRole('radio', { name: /Continuar/ })
      .check();
    await drawer(page).getByRole('button', { name: 'Registrar check-in' }).click();
    await expect(page.getByRole('row', { name: new RegExp(first.krs[1].title) })).toContainText(
      'En ruta',
    );

    // Manual: puntaje 0,0 a 1,0 en pasos de 0,1.
    await checkInButton(page, first.krs[2].title).click();
    await drawer(page)
      .getByLabel(/^Puntaje/)
      .selectOption('0.4');
    await expect(page.getByTestId('check-in-preview')).toContainText('Requiere atención');
    await drawer(page).getByRole('button', { name: 'Registrar check-in' }).click();
    await expect(page.getByRole('row', { name: new RegExp(first.krs[2].title) })).toContainText(
      'Requiere atención',
    );
    await expect(page.getByRole('meter', { name: `Score de ${first.title}` })).toHaveAttribute(
      'aria-valuetext',
      '0,60',
    );
    await page.screenshot({ path: `${SHOTS}/objetivo-detalle-check-ins.png`, fullPage: true });
  });

  test('administración ve la acción deshabilitada y se explica por qué', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    const first = ctx.objectives[0];
    await page.goto(`/objetivos/${first.id}`);
    const button = checkInButton(page, first.krs[0].title);
    await expect(button).toBeDisabled();
    await expect(
      page.getByText('Solo quien ejecuta el resultado clave o su líder puede registrar avances.'),
    ).toBeVisible();
  });

  test('Pendientes lista los KRs vencidos por objetivo y queda vacío tras registrarlos', async ({
    page,
  }) => {
    const second = ctx.objectives[1];
    backdatePublication(second.id, 20);

    await login(page, ana.email, PASSWORD);
    await navLink(page, 'Check-ins').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pendientes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: second.title })).toBeVisible();
    await expect(page.getByText('Check-in vencido').filter({ visible: true })).toHaveCount(3);
    await expect(page.getByText(/Sin check-ins desde la publicación/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/check-ins-pendientes.png`, fullPage: true });

    const values = ['60', '40', null];
    for (const [i, kr] of second.krs.entries()) {
      await checkInButton(page, kr.title).click();
      const value = values[i];
      if (value)
        await drawer(page)
          .getByLabel(/^Valor actual/)
          .fill(value);
      else
        await drawer(page)
          .getByLabel(/^Puntaje/)
          .selectOption('1');
      await drawer(page).getByRole('button', { name: 'Registrar check-in' }).click();
      await expect(drawer(page)).toHaveCount(0);
    }
    await expect(
      page.getByText('Estás al día con tus check-ins.').filter({ visible: true }),
    ).toBeVisible();

    // El objetivo refleja los datos nuevos (updateTag): ya no hay "Sin check-ins".
    await page.goto(`/objetivos/${second.id}`);
    await expect(page.getByText('Sin check-ins')).toHaveCount(0);
    await expect(page.getByText('Check-in vencido')).toHaveCount(0);
  });
});
