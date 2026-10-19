import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  ADMIN,
  PASSWORD,
  createUser,
  loginAdminApi,
  seedActiveCycles,
  seedPublishedObjectives,
  seedTeam,
  sessionFor,
  uniqueSuffix,
  uniqueYear,
  api,
} from './helpers';

/**
 * Accesibilidad (axe-core, WCAG 2.0/2.1 A y AA) en las rutas principales, en tema claro y oscuro.
 * Falla ante cualquier violación `serious` o `critical`; las `moderate`/`minor` se informan en
 * `test-results/a11y-report.json` y en consola. El tema oscuro de la app se activa con la clase `.dark`
 * (la app todavía no expone un selector de tema; los tokens oscuros existen y se verifican acá).
 */
const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const people = {
  lead: { name: `Lia Lider ${suffix}`, email: `lia.a11y.${suffix}@e2e.test` },
  ana: { name: `Ana A11y ${suffix}`, email: `ana.a11y.${suffix}@e2e.test` },
  beto: { name: `Beto A11y ${suffix}`, email: `beto.a11y.${suffix}@e2e.test` },
};

const ctx = {
  cycleId: '',
  annualId: '',
  teamId: '',
  objectiveId: '',
  draftId: '',
  feedbackId: '',
};

type Row = { route: string; theme: string; violations: Record<string, number>; detail: string[] };
const report: Row[] = [];

async function scan(page: Page, route: string, theme: 'claro' | 'oscuro') {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    (dark) => document.documentElement.classList.toggle('dark', dark),
    theme === 'oscuro',
  );
  // Deja correr transiciones de color (150 ms) antes de medir contraste.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // El tema se aplicó de verdad (si no, el escaneo oscuro mediría el claro) y axe evaluó reglas.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (theme === 'oscuro' && route !== '/ui') expect.soft(bg).not.toBe('rgb(247, 245, 250)');
  expect.soft(results.passes.length).toBeGreaterThan(10);
  const counts: Record<string, number> = {};
  if (results.incomplete.length) counts.revisarAMano = results.incomplete.length;
  const detail: string[] = results.incomplete.map(
    (v) => 'revisar a mano ' + v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | '),
  );
  for (const v of results.violations) {
    counts[v.impact ?? 'minor'] = (counts[v.impact ?? 'minor'] ?? 0) + v.nodes.length;
    detail.push(
      `${v.impact} ${v.id}: ${v.nodes
        .slice(0, 3)
        .map((n) => `${n.target.join(' ')} -> ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`)
        .join(' | ')}`,
    );
  }
  report.push({ route, theme, violations: counts, detail });
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect
    .soft(
      blocking.map(
        (v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
      `${route} (${theme})`,
    )
    .toEqual([]);
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('sanity: axe detecta un contraste insuficiente (el escáner funciona)', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'contraste-malo';
    p.textContent = 'Texto de prueba con contraste insuficiente';
    p.setAttribute('style', 'color:#cccccc;background:#ffffff;font-size:14px');
    document.querySelector('main')!.append(p);
  });
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
  expect(violations.map((v) => v.id)).toContain('color-contrast');
});

test.describe('accesibilidad (axe) en rutas principales', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginAdminApi(request);
    const { annualId, quarterId } = await seedActiveCycles(request, admin.token, YEAR, suffix);
    ctx.cycleId = quarterId;
    ctx.annualId = annualId;
    const lead = await createUser(request, admin.token, people.lead, 'LEADER');
    const ana = await createUser(request, admin.token, people.ana);
    const beto = await createUser(request, admin.token, people.beto);
    ctx.teamId = await seedTeam(request, admin.token, `Equipo A11y ${suffix}`, [
      { id: lead.id, lead: true },
      { id: ana.id },
      { id: beto.id },
    ]);
    const published = await seedPublishedObjectives(request, ana.token, {
      cycleId: quarterId,
      owner: { ownerUserId: ana.id },
      krOwnerId: ana.id,
      label: `Objetivo A11y ${suffix}`,
    });
    ctx.objectiveId = published[0].id;
    await api(request, 'post', `/key-results/${published[0].krs[0].id}/check-ins`, ana.token, {
      action: 'UPDATE',
      value: '55',
    });
    await seedPublishedObjectives(request, lead.token, {
      cycleId: quarterId,
      owner: { ownerTeamId: ctx.teamId },
      krOwnerId: ana.id,
      label: `Objetivo de equipo A11y ${suffix}`,
      origin: 'TOP_DOWN',
    });
    const draft = await api<{ id: string }>(request, 'post', '/objectives', ana.token, {
      cycleId: quarterId,
      ownerUserId: ana.id,
      title: `Borrador A11y ${suffix}`,
      type: 'ASPIRATIONAL',
      origin: 'TOP_DOWN',
    });
    ctx.draftId = draft.id;
    const feedback = await api<{ id: string }>(request, 'post', '/feedback', beto.token, {
      toUserId: ana.id,
      content: `Gracias por ordenar el planning ${suffix}`,
    });
    ctx.feedbackId = feedback.id;
    await api(request, 'post', '/recognitions', beto.token, {
      toUserId: ana.id,
      message: `Cerraste un hito enorme ${suffix}`,
    });
    await request.dispose();
  });

  test.afterAll(() => {
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/a11y-report.json', JSON.stringify(report, null, 2));
    console.log(
      report
        .map(
          (r) =>
            `${r.route.padEnd(34)} ${r.theme.padEnd(7)} ${JSON.stringify(r.violations)}${r.detail.length ? '\n    ' + r.detail.join('\n    ') : ''}`,
        )
        .join('\n'),
    );
  });

  for (const theme of ['claro', 'oscuro'] as const) {
    test(`público: login, 404 y catálogo /ui (${theme})`, async ({ page }) => {
      await scan(page, '/login', theme);
      await scan(page, '/ui', theme);
    });

    test(`miembro: inicio, objetivos, check-ins, feedback y reconocimientos (${theme})`, async ({
      browser,
    }: {
      browser: Browser;
    }) => {
      const page = await sessionFor(browser, people.ana.email, PASSWORD);
      const routes = [
        '/',
        `/objetivos?cycleId=${ctx.cycleId}`,
        `/objetivos/${ctx.objectiveId}`,
        `/objetivos/${ctx.draftId}`,
        `/objetivos/nuevo?cycleId=${ctx.cycleId}`,
        '/check-ins',
        '/equipos',
        `/equipos/${ctx.teamId}?cycleId=${ctx.cycleId}`,
        '/ciclos',
        `/ciclos/${ctx.cycleId}`,
        '/feedback',
        `/feedback/${ctx.feedbackId}`,
        '/feedback/nuevo',
        '/reconocimientos',
        '/reconocimientos/nuevo',
        '/pedidos-adaptacion',
        '/pedidos-adaptacion/nuevo',
        '/ruta-que-no-existe',
      ];
      for (const route of routes) await scan(page, route, theme);
      await page.context().close();
    });

    test(`admin: usuarios, uso de IA, ciclos y detalle de ciclo (${theme})`, async ({
      browser,
    }) => {
      const page = await sessionFor(browser, ADMIN.email, ADMIN.password);
      for (const route of [
        '/admin/usuarios',
        '/admin/uso-ia',
        '/admin/auditoria',
        '/admin/pedidos-adaptacion',
        '/ciclos',
        `/ciclos/${ctx.annualId}`,
      ]) {
        await scan(page, route, theme);
      }
      await page.context().close();
    });
  }
});
