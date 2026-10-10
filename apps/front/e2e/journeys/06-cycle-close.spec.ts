import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SHOTS,
  adminSession,
  api,
  createUser,
  loginAdminApi,
  seedActiveCycles,
  seedPublishedObjectives,
  sessionFor,
  uniqueSuffix,
  uniqueYear,
} from '../helpers';

/**
 * Cierre de ciclo: administración cierra el trimestre por la UI; los objetivos muestran puntaje final y si
 * se alcanzó el umbral (ícono + palabra), y el check-in sobre un objetivo cerrado queda deshabilitado con su razón.
 */
const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const quarterName = `Q1 ${YEAR} ${suffix}`;
const me = { name: `Cora Cierre ${suffix}`, email: `cora.cierre.${suffix}@e2e.test` };

test('admin cierra el ciclo: puntaje final, logrado/no logrado y check-in deshabilitado', async ({
  browser,
  playwright,
}) => {
  test.setTimeout(180_000);
  const request = await playwright.request.newContext();
  const admin = await loginAdminApi(request);
  const { quarterId } = await seedActiveCycles(request, admin.token, YEAR, suffix);
  const user = await createUser(request, admin.token, me);
  const objectives = await seedPublishedObjectives(request, user.token, {
    cycleId: quarterId,
    owner: { ownerUserId: user.id },
    krOwnerId: user.id,
    label: `Cierre ${suffix}`,
  });
  // Objetivo 1: todos sus KRs al 100 % (1,00 => logrado, umbral de comprometidos = 1). Objetivo 2: 30 % (no logrado).
  for (const kr of objectives[0].krs) {
    await api(request, 'post', `/key-results/${kr.id}/check-ins`, user.token, {
      action: 'UPDATE',
      value: '100',
    });
  }
  for (const kr of objectives[1].krs) {
    await api(request, 'post', `/key-results/${kr.id}/check-ins`, user.token, {
      action: 'UPDATE',
      value: '30',
    });
  }

  // Admin cierra el trimestre por la UI.
  const adminPage = await adminSession(browser);
  await adminPage.goto(`/ciclos/${quarterId}`);
  await expect(adminPage.getByRole('heading', { level: 1, name: quarterName })).toBeVisible();
  await adminPage.getByRole('button', { name: 'Cerrar ciclo' }).click();
  await adminPage.getByRole('alertdialog').getByRole('button', { name: 'Cerrar ciclo' }).click();
  await expect(adminPage.getByRole('region', { name: 'Notificaciones' })).toContainText(
    'Cerramos el ciclo',
  );
  await adminPage.context().close();

  // La persona ve el resultado final de cada objetivo.
  const page = await sessionFor(browser, me.email, PASSWORD);
  await page.goto(`/objetivos/${objectives[0].id}`);
  await expect(page.getByText('Cerrado', { exact: true }).first()).toBeVisible();
  const achieved = page.getByTestId('final-result');
  await expect(achieved).toContainText('Puntaje final 1,00');
  await expect(achieved).toContainText('Logrado');
  await expect(achieved).not.toContainText('No logrado');
  await page.screenshot({ path: `${SHOTS}/journey-cierre-logrado.png`, fullPage: true });

  // Check-in sobre un objetivo cerrado: deshabilitado y con la razón a la vista.
  const button = page.getByRole('button', {
    name: `Registrar check-in de ${objectives[0].krs[0].title}`,
  });
  await expect(button).toBeDisabled();
  await expect(
    page
      .getByText(/cerrado/i)
      .filter({ hasText: /check-ins/ })
      .first(),
  ).toBeVisible();

  await page.goto(`/objetivos/${objectives[1].id}`);
  await expect(page.getByTestId('final-result')).toContainText('Puntaje final 0,30');
  await expect(page.getByTestId('final-result')).toContainText('No logrado');

  // Lista: ambos muestran su resultado final.
  await page.goto(`/objetivos?cycleId=${quarterId}`);
  await expect(
    page
      .getByTestId('final-result')
      .filter({ hasText: 'Logrado' })
      .filter({ hasNotText: 'No logrado' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('final-result').filter({ hasText: 'No logrado' })).toHaveCount(2);
  await page.context().close();
  await request.dispose();
});
