import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SHOTS,
  adminSession,
  api,
  createUser,
  dialog,
  loginAdminApi,
  loginUi,
  navLink,
  uniqueSuffix,
  uniqueYear,
} from '../helpers';

/**
 * Recorrido: administración deja listo el ciclo y el equipo. Ciclo anual + trimestre (se activan por la UI),
 * equipo con una líder y dos integrantes (por la UI). Las personas se dan de alta por API (el alta por UI
 * ya la cubre ciclos-equipos.spec) y la líder entra después y ve su equipo.
 */
const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const annualName = `OKR ${YEAR} setup ${suffix}`;
const quarterName = `Q1 ${YEAR} setup ${suffix}`;
const teamName = `Equipo setup ${suffix}`;
const people = {
  lead: { name: `Lola Lider ${suffix}`, email: `lola.setup.${suffix}@e2e.test` },
  m1: { name: `Mario Miembro ${suffix}`, email: `mario.setup.${suffix}@e2e.test` },
  m2: { name: `Nora Miembro ${suffix}`, email: `nora.setup.${suffix}@e2e.test` },
};

test('admin crea y activa el ciclo anual y el trimestre, arma el equipo con líder y 2 integrantes', async ({
  browser,
  playwright,
}) => {
  test.setTimeout(150_000);
  const request = await playwright.request.newContext();
  const admin = await loginAdminApi(request);
  for (const p of Object.values(people)) await createUser(request, admin.token, p);

  const page = await adminSession(browser);
  await navLink(page, 'Ciclos').click();

  // Anual y trimestre por la UI.
  await expect(dialog(page)).toHaveCount(0); // el submit del modal se llama igual que el botón de la vista
  await page.getByRole('button', { name: 'Crear ciclo' }).click();
  await dialog(page)
    .getByLabel(/Nombre/)
    .fill(annualName);
  await dialog(page)
    .getByLabel(/Inicio/)
    .fill(`${YEAR}-01-01`);
  await dialog(page).getByLabel(/Fin/).fill(`${YEAR}-12-31`);
  await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();
  const annualRow = page.getByRole('region', { name: annualName });
  await expect(annualRow).toBeVisible();

  await expect(dialog(page)).toHaveCount(0); // el submit del modal se llama igual que el botón de la vista
  await page.getByRole('button', { name: 'Crear ciclo' }).click();
  await dialog(page)
    .getByLabel(/Nombre/)
    .fill(quarterName);
  await dialog(page).getByLabel(/Tipo/).selectOption('QUARTER');
  const annualOption = dialog(page)
    .getByLabel(/Ciclo anual/)
    .locator('option', { hasText: annualName });
  await dialog(page)
    .getByLabel(/Ciclo anual/)
    .selectOption((await annualOption.getAttribute('value')) as string);
  await dialog(page)
    .getByLabel(/Inicio/)
    .fill(`${YEAR}-01-01`);
  await dialog(page).getByLabel(/Fin/).fill(`${YEAR}-03-31`);
  await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();
  await expect(annualRow.getByRole('link', { name: quarterName })).toBeVisible();

  // Activar: primero el anual, luego el trimestre.
  await annualRow.getByRole('link', { name: annualName }).click();
  await page.getByRole('button', { name: 'Activar ciclo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Activar ciclo' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar ciclo' })).toBeVisible();

  await navLink(page, 'Ciclos').click();
  await page
    .getByRole('region', { name: annualName })
    .getByRole('link', { name: quarterName })
    .click();
  await page.getByRole('button', { name: 'Activar ciclo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Activar ciclo' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar ciclo' })).toBeVisible();

  // Equipo con líder y 2 integrantes.
  await navLink(page, 'Equipos').click();
  await expect(dialog(page)).toHaveCount(0); // el submit del modal se llama igual que el botón de la vista
  await page.getByRole('button', { name: 'Crear equipo' }).click();
  await dialog(page)
    .getByLabel(/Nombre/)
    .fill(teamName);
  await dialog(page)
    .getByLabel(/Equipo padre/)
    .selectOption({ index: 1 });
  await dialog(page).getByRole('button', { name: 'Crear equipo' }).click();
  await page.getByRole('link', { name: teamName }).click();
  await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();

  for (const [who, lead] of [
    [people.lead, true],
    [people.m1, false],
    [people.m2, false],
  ] as const) {
    await expect(dialog(page)).toHaveCount(0); // el submit del modal se llama igual que el botón de la vista
    await page.getByRole('button', { name: 'Agregar integrante' }).click();
    await dialog(page)
      .getByLabel(/Persona/)
      .selectOption({ label: who.name });
    if (lead) await dialog(page).getByRole('switch', { name: 'Es líder del equipo' }).check();
    await dialog(page).getByRole('button', { name: 'Agregar al equipo' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(
      page
        .locator('section', { has: page.getByRole('heading', { name: 'Integrantes' }) })
        .getByText(who.name),
    ).toBeVisible();
  }
  const members = page.locator('section', {
    has: page.getByRole('heading', { name: 'Integrantes' }),
  });
  await expect(members.getByText('Líder', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/journey-admin-equipo.png`, fullPage: true });

  // Quedó consistente para el resto de las personas: el trimestre figura como activo en la API y la líder ve su equipo.
  const cycles = await api<{ name: string; status: string }[]>(
    request,
    'get',
    '/cycles',
    admin.token,
  );
  expect(cycles.find((c) => c.name === quarterName)?.status).toBe('ACTIVE');
  expect(cycles.find((c) => c.name === annualName)?.status).toBe('ACTIVE');

  const leader = await browser.newContext();
  const leaderPage = await leader.newPage();
  await loginUi(leaderPage, people.lead.email, PASSWORD);
  await navLink(leaderPage, 'Equipos').click();
  await expect(leaderPage.getByRole('link', { name: teamName })).toBeVisible();
  await leader.close();
  await page.context().close();
  await request.dispose();
});
