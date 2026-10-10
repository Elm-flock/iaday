import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SHOTS,
  api,
  createObjectiveUi,
  createUser,
  loginAdminApi,
  seedActiveCycles,
  seedPublishedObjectives,
  seedTeam,
  sessionFor,
  uniqueSuffix,
  uniqueYear,
} from '../helpers';

/**
 * Recorrido de una líder: crea los objetivos del equipo (top-down), ve el indicador 50/50 contra los
 * individuales (bottom-up) de sus integrantes, descarga el PDF del equipo y reconoce un KR >= 0,70.
 */
const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const teamName = `Equipo Lider ${suffix}`;
const people = {
  lead: { name: `Lara Lider ${suffix}`, email: `lara.lider.${suffix}@e2e.test` },
  a: { name: `Ana Equipo ${suffix}`, email: `ana.lider.${suffix}@e2e.test` },
  b: { name: `Bruno Equipo ${suffix}`, email: `bruno.lider.${suffix}@e2e.test` },
};
const aKr = `Clientes nuevos ${suffix}`;
const MESSAGE = `Superaste la meta de clientes ${suffix}`;

test('la líder crea objetivos de equipo, ve el 50/50, descarga el PDF y reconoce un logro', async ({
  browser,
  playwright,
}) => {
  test.setTimeout(240_000);
  const request = await playwright.request.newContext();
  const admin = await loginAdminApi(request);
  const { quarterId } = await seedActiveCycles(request, admin.token, YEAR, suffix);
  const cycleName = `Q1 ${YEAR} ${suffix}`;
  const lead = await createUser(request, admin.token, people.lead, 'LEADER');
  const a = await createUser(request, admin.token, people.a);
  const b = await createUser(request, admin.token, people.b);
  const teamId = await seedTeam(request, admin.token, teamName, [
    { id: lead.id, lead: true },
    { id: a.id },
    { id: b.id },
  ]);

  // Ana: 3 objetivos individuales bottom-up; un KR suyo queda en 0,80.
  const own = await seedPublishedObjectives(request, a.token, {
    cycleId: quarterId,
    owner: { ownerUserId: a.id },
    krOwnerId: a.id,
    label: `Individual ${suffix}`,
  });
  await api(request, 'post', `/key-results/${own[0].krs[0].id}/check-ins`, a.token, {
    action: 'UPDATE',
    value: '80',
  });

  const page = await sessionFor(browser, people.lead.email, PASSWORD);

  // Los 3 objetivos de equipo, top-down, creados por la UI (responsable = el equipo).
  const teamTitles = [1, 2, 3].map((n) => `De equipo ${n} ${suffix}`);
  const ids: string[] = [];
  for (const title of teamTitles) {
    await createObjectiveUi(page, quarterId, title, { origin: 'TOP_DOWN', owner: teamName });
    ids.push(page.url().split('/objetivos/')[1]);
  }
  // Sus KRs y la publicación (mínimo 3 + 3) por API con la sesión de la líder; el KR de Ana es el que se reconocerá.
  for (const [i, id] of ids.entries()) {
    for (const k of [1, 2, 3]) {
      await api(request, 'post', `/objectives/${id}/key-results`, lead.token, {
        title: i === 0 && k === 1 ? aKr : `KR equipo ${i + 1}.${k} ${suffix}`,
        scoring: 'DERIVED',
        startValue: '0',
        targetValue: '100',
        unit: 'clientes',
        ownerId: a.id,
      });
    }
  }
  for (const id of ids) await api(request, 'post', `/objectives/${id}/publish`, lead.token);
  const teamObjective = await api<{ keyResults: { id: string; title: string }[] }>(
    request,
    'get',
    `/objectives/${ids[0]}`,
    lead.token,
  );
  const krId = teamObjective.keyResults.find((k) => k.title === aKr)!.id;
  await api(request, 'post', `/key-results/${krId}/check-ins`, a.token, {
    action: 'UPDATE',
    value: '80',
  });

  // Equipo: indicador 50/50 (3 top-down del equipo + 3 bottom-up individuales de Ana).
  await page.goto(`/equipos/${teamId}?cycleId=${quarterId}`);
  await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();
  const mix = page.getByTestId('origin-mix');
  await expect(mix).toContainText('Equilibrado');
  await expect(mix).toContainText('50 % · 3 objetivos'.replace('50 %', '50 %'));
  await expect(mix.getByRole('img')).toHaveAccessibleName(/Top-down 50 %, bottom-up 50 %/);
  await page.screenshot({ path: `${SHOTS}/journey-lider-equipo.png`, fullPage: true });

  // PDF del equipo: descarga real, encabezado %PDF y nombre de archivo.
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Descargar reporte PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`reporte-${slug(teamName)}-${slug(cycleName)}.pdf`);
  fs.mkdirSync('test-results', { recursive: true });
  const out = `test-results/journey-lider-${suffix}.pdf`;
  await file.saveAs(out);
  const bytes = fs.readFileSync(out);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(5_000);

  // Reconocer a Ana por su KR (>= 0,70) dentro de un objetivo del equipo.
  await page.goto('/reconocimientos/nuevo');
  await page.getByLabel(/^Persona/).selectOption({ label: people.a.name });
  await page.getByRole('button', { name: 'Continuar' }).click();
  const milestone = page.getByLabel(/^Logro/);
  await expect(milestone.locator('option', { hasText: aKr })).toHaveCount(1);
  await expect(milestone.locator('option', { hasText: aKr })).toContainText('0,80');
  await milestone.selectOption({ label: `Resultado clave: ${aKr} (${teamTitles[0]}) · 0,80` });
  await page.getByLabel(/^Mensaje/).fill(MESSAGE);
  await page.getByRole('button', { name: 'Reconocer logro' }).click();
  await expect(page).toHaveURL(/\/reconocimientos\?creado=1/);
  const card = page.getByRole('article').filter({ hasText: MESSAGE });
  await expect(card.getByTestId('recognition-milestone')).toContainText(aKr);
  await expect(card.getByTestId('recognition-milestone')).toContainText('Puntaje 0,80');

  await page.context().close();
  await request.dispose();
});
