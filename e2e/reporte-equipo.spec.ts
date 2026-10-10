import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { ADMIN, PASSWORD, SHOTS, api, loginApi, loginUi, uniqueSuffix } from './helpers';
import fs from 'node:fs';

// Requiere el back real con un admin sembrado (ver CLAUDE.md > Testing). Los datos se preparan por API;
// la descarga del PDF y el reconocimiento de un KR de un objetivo de equipo se recorren por la UI.
const PDF_OUT = 'test-results/reporte-equipo.pdf';

const suffix = uniqueSuffix();
const YEAR = 2100 + ((Date.now() + 313) % 800);
const people = {
  zoe: { name: `Zoe Álvarez ${suffix}`, email: `zoe.rep.${suffix}@e2e.test` },
  ana: { name: `Ana Pérez ${suffix}`, email: `ana.rep.${suffix}@e2e.test` },
  mara: { name: `Mara Díaz ${suffix}`, email: `mara.rep.${suffix}@e2e.test` },
};
type Who = keyof typeof people;

const teamName = `Plataforma Núcleo ${suffix}`;
const cycleName = `Q1 ${YEAR} reporte ${suffix}`;
const teamKr = `Tiempo de respuesta ${suffix}`;
const zoeKr = `Clientes nuevos ${suffix}`;
const RECOGNITION_TEXT = `Bajaste el tiempo de respuesta ${suffix}`;

const ctx = {
  adminToken: '',
  cycleId: '',
  teamId: '',
  ids: {} as Record<Who, string>,
  tokens: {} as Record<Who, string>,
};

async function sessionFor(browser: Browser, who: Who | 'admin'): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (who === 'admin') await loginUi(page, ADMIN.email, ADMIN.password);
  else await loginUi(page, people[who].email, PASSWORD);
  return page;
}

/** 3 objetivos publicados (mínimo para publicar) con 3 KRs cada uno; devuelve ids de objetivos y KRs. */
async function publishedObjectives(
  request: APIRequestContext,
  token: string,
  owner: { ownerUserId: string } | { ownerTeamId: string },
  label: string,
  krOwnerId: string,
  firstKrTitle: string,
) {
  const created: { id: string; krs: string[] }[] = [];
  for (const n of [1, 2, 3]) {
    const objective = await api<{ id: string }>(request, 'post', '/objectives', token, {
      cycleId: ctx.cycleId,
      title: `${label} ${n} ${suffix}`,
      type: 'COMMITTED',
      origin: 'BOTTOM_UP',
      ...owner,
    });
    const krs: string[] = [];
    for (const k of [1, 2, 3]) {
      const kr = await api<{ id: string }>(
        request,
        'post',
        `/objectives/${objective.id}/key-results`,
        token,
        {
          title: n === 1 && k === 1 ? firstKrTitle : `KR ${label} ${n}.${k} ${suffix}`,
          scoring: 'DERIVED',
          startValue: '0',
          targetValue: '100',
          unit: 'clientes',
          ownerId: krOwnerId,
        },
      );
      krs.push(kr.id);
    }
    created.push({ id: objective.id, krs });
  }
  for (const o of created) await api(request, 'post', `/objectives/${o.id}/publish`, token);
  return created;
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('Reporte PDF del equipo y reconocimiento de KRs de equipo (contra el back real)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginApi(request, ADMIN.email, ADMIN.password);
    ctx.adminToken = admin.token;

    const cycleBody = {
      checkInCadence: 'WEEKLY',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    };
    const annual = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `OKR ${YEAR} reporte ${suffix}`,
      kind: 'ANNUAL',
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
      ...cycleBody,
    });
    const quarter = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: cycleName,
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
      await api(request, 'post', '/users', admin.token, {
        ...people[who],
        password: PASSWORD,
        role: 'MEMBER',
      });
      const session = await loginApi(request, people[who].email, PASSWORD);
      ctx.ids[who] = session.id;
      ctx.tokens[who] = session.token;
    }

    const tree = await api<{ id: string; parentId: string | null }[]>(
      request,
      'get',
      '/teams',
      admin.token,
    );
    const team = await api<{ id: string }>(request, 'post', '/teams', admin.token, {
      name: teamName,
      parentId: tree[0].id,
    });
    ctx.teamId = team.id;
    for (const who of Object.keys(people) as Who[]) {
      await api(request, 'put', `/teams/${team.id}/members/${ctx.ids[who]}`, admin.token, {});
    }

    // Objetivos del equipo: Ana es responsable de un KR (el que se reconoce). Un check-in lo deja en 0,80.
    const teamObjectives = await publishedObjectives(
      request,
      admin.token,
      { ownerTeamId: team.id },
      'Objetivo de equipo',
      ctx.ids.ana,
      teamKr,
    );
    await api(
      request,
      'post',
      `/key-results/${teamObjectives[0].krs[0]}/check-ins`,
      ctx.tokens.ana,
      {
        action: 'UPDATE',
        value: '80',
      },
    );

    // Zoe: la persona con el mejor score, y última en orden alfabético por apellido... y nombre.
    const zoeObjectives = await publishedObjectives(
      request,
      ctx.tokens.zoe,
      { ownerUserId: ctx.ids.zoe },
      'Objetivo de Zoe',
      ctx.ids.zoe,
      zoeKr,
    );
    await api(
      request,
      'post',
      `/key-results/${zoeObjectives[0].krs[0]}/check-ins`,
      ctx.tokens.zoe,
      {
        action: 'UPDATE',
        value: '100',
      },
    );
    await request.dispose();
  });

  test('el botón descarga un PDF válido con el nombre esperado', async ({ browser }) => {
    const page = await sessionFor(browser, 'admin');
    await page.goto(`/equipos/${ctx.teamId}?cycleId=${ctx.cycleId}`);
    await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();

    const button = page.getByRole('link', { name: 'Descargar reporte PDF' });
    await expect(button).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;

    const slug = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    expect(download.suggestedFilename()).toBe(`reporte-${slug(teamName)}-${slug(cycleName)}.pdf`);

    fs.mkdirSync('test-results', { recursive: true });
    await download.saveAs(PDF_OUT);
    const bytes = fs.readFileSync(PDF_OUT);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);
    await page.screenshot({ path: `${SHOTS}/equipos-descarga-reporte.png`, fullPage: true });
    await page.context().close();
  });

  test('sin ciclo elegido el botón está deshabilitado y explica por qué', async ({ browser }) => {
    const page = await sessionFor(browser, 'admin');
    await page.goto(`/equipos/${ctx.teamId}?cycleId=`);
    await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar reporte PDF' })).toBeDisabled();
    await expect(page.getByText('Elegí un ciclo para descargar el reporte.')).toBeVisible();
    await page.context().close();
  });

  test('el endpoint responde 401 sin sesión, 400 sin cycleId, 404 si no existe y 403 a un integrante', async ({
    playwright,
    browser,
  }) => {
    const anon = await playwright.request.newContext({ baseURL: 'http://localhost:3001' });
    const url = `/api/reports/teams/${ctx.teamId}/pdf?cycleId=${ctx.cycleId}`;
    const res = await anon.get(url, { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).not.toContain('application/pdf');
    await anon.dispose();

    const page = await sessionFor(browser, 'ana');
    const missing = await page.request.get(`/api/reports/teams/${ctx.teamId}/pdf`);
    expect(missing.status()).toBe(400);
    const unknown = await page.request.get(
      `/api/reports/teams/00000000-0000-4000-8000-000000000000/pdf?cycleId=${ctx.cycleId}`,
    );
    expect(unknown.status()).toBe(404);
    // Ana es integrante (no líder ni ADMIN): el back responde 403 y el front lo pasa como JSON.
    const forbidden = await page.request.get(
      `/api/reports/teams/${ctx.teamId}/pdf?cycleId=${ctx.cycleId}`,
    );
    expect(forbidden.status()).toBe(403);
    expect(forbidden.headers()['content-type']).toContain('application/json');
    await page.context().close();

    // ADMIN sí: headers de descarga y sin caché.
    const adminPage = await sessionFor(browser, 'admin');
    const ok = await adminPage.request.get(
      `/api/reports/teams/${ctx.teamId}/pdf?cycleId=${ctx.cycleId}`,
    );
    expect(ok.status()).toBe(200);
    expect(ok.headers()['cache-control']).toBe('no-store');
    expect(ok.headers()['content-disposition']).toMatch(/^attachment; filename="reporte-/);
    expect((await ok.body()).subarray(0, 4).toString('latin1')).toBe('%PDF');
    await adminPage.context().close();
  });

  test('un integrante no ve el botón de descarga del reporte', async ({ browser }) => {
    const page = await sessionFor(browser, 'ana');
    await page.goto(`/equipos/${ctx.teamId}?cycleId=${ctx.cycleId}`);
    await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();
    await expect(page.getByText('Mezcla de objetivos (50/50)')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Descargar reporte PDF' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Descargar reporte PDF' })).toHaveCount(0);
    await page.context().close();
  });

  test('Zoe reconoce a Ana por un KR que ejecuta dentro de un objetivo del equipo (>= 0,70)', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, 'zoe');
    await page.goto('/reconocimientos/nuevo');
    await page.getByLabel(/^Persona/).selectOption({ label: people.ana.name });
    await page.getByRole('button', { name: 'Continuar' }).click();

    const milestone = page.getByLabel(/^Logro/);
    await expect(milestone).toBeVisible();
    const option = milestone.locator('option', { hasText: teamKr });
    await expect(option).toHaveCount(1);
    await expect(option).toContainText('0,80');
    // Los otros KRs del objetivo de equipo (sin check-ins, o de otra persona) no se ofrecen.
    await expect(milestone.locator('option', { hasText: 'KR Objetivo de equipo' })).toHaveCount(0);

    await milestone.selectOption({
      label: `Resultado clave: ${teamKr} (Objetivo de equipo 1 ${suffix}) · 0,80`,
    });
    await page.getByLabel(/^Mensaje/).fill(RECOGNITION_TEXT);
    await page.getByRole('button', { name: 'Reconocer logro' }).click();

    await expect(page).toHaveURL(/\/reconocimientos\?creado=1/);
    const card = page.getByRole('article').filter({ hasText: RECOGNITION_TEXT });
    await expect(card).toContainText(people.ana.name);
    await expect(card.getByTestId('recognition-milestone')).toContainText(teamKr);
    await page.context().close();
  });
});
