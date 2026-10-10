import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  SHOTS,
  addKeyResultUi,
  checkInUi,
  createObjectiveUi,
  createUser,
  loginAdminApi,
  loginUi,
  publishObjectiveUi,
  seedActiveCycles,
  uniqueSuffix,
  uniqueYear,
} from '../helpers';

/**
 * Recorrido de una persona: entra, crea 3 objetivos con 3 KRs cada uno (uno manual y uno decreciente),
 * los publica, ve "Sin check-ins", registra check-ins y ve cómo cambian bandas y puntajes, también en Inicio.
 */
const suffix = uniqueSuffix();
const me = { name: `Maia Miembro ${suffix}`, email: `maia.okr.${suffix}@e2e.test` };
const titles = [1, 2, 3].map((n) => `Objetivo ${n} ${suffix}`);
const kr = (n: number, k: 'A' | 'B' | 'C') => `KR ${k} del objetivo ${n} ${suffix}`;

test('crear 3 objetivos con 3 KRs, publicar, check-ins y ver el avance en el dashboard', async ({
  page,
  playwright,
}) => {
  // ~45 pasos de UI: 40 s aislado, pero >240 s en una corrida completa en frío (4 workers + a11y escaneando en paralelo).
  test.setTimeout(420_000);
  const request = await playwright.request.newContext();
  const admin = await loginAdminApi(request);
  const { quarterId } = await seedActiveCycles(request, admin.token, uniqueYear(), suffix);
  await createUser(request, admin.token, me);
  await request.dispose();

  await loginUi(page, me.email, PASSWORD);

  // 3 objetivos x 3 KRs: A numérico creciente (0 -> 100), B decreciente (100 -> 0), C manual.
  for (const [i, title] of titles.entries()) {
    const n = i + 1;
    await createObjectiveUi(page, quarterId, title);
    await addKeyResultUi(page, { title: kr(n, 'A'), start: '0', target: '100' });
    await addKeyResultUi(page, { title: kr(n, 'B'), start: '100', target: '0', unit: 'días' });
    await addKeyResultUi(page, { title: kr(n, 'C'), manual: true });
    await expect(page.getByRole('heading', { name: /Resultados clave \(3 de 5\)/ })).toBeVisible();
  }

  // Publicar los tres (la confirmación explica la regla 3 + 3).
  for (const title of titles) {
    await page.goto(`/objetivos?cycleId=${quarterId}`);
    await page.getByRole('link', { name: new RegExp(title) }).click();
    await publishObjectiveUi(page);
  }

  // Sin check-ins: estado neutro, ni banda ni barra.
  await page.goto(`/objetivos?cycleId=${quarterId}`);
  await expect(page.getByTestId('limit-indicator')).toHaveText('3 de 5 objetivos');
  await expect(page.getByText('Sin check-ins').filter({ visible: true })).toHaveCount(3);
  await expect(page.getByRole('meter')).toHaveCount(0);

  // Check-ins del objetivo 1: A=70 (0,70 en ruta), B=30 (decreciente: 0,70), C manual 0,4 (requiere atención).
  await page.getByRole('link', { name: new RegExp(titles[0]) }).click();
  await checkInUi(page, kr(1, 'A'), { value: '70', note: 'Cerramos dos cuentas grandes' });
  await expect(page.getByRole('row', { name: new RegExp(kr(1, 'A')) })).toContainText('En ruta');
  await checkInUi(page, kr(1, 'B'), { value: '30' });
  await expect(page.getByRole('row', { name: new RegExp(kr(1, 'B')) })).toContainText('En ruta');
  await checkInUi(page, kr(1, 'C'), { manualScore: '0.4' });
  await expect(page.getByRole('row', { name: new RegExp(kr(1, 'C')) })).toContainText(
    'Requiere atención',
  );
  // Promedio: (0,70 + 0,70 + 0,40) / 3 = 0,60.
  await expect(page.getByRole('meter', { name: `Score de ${titles[0]}` })).toHaveAttribute(
    'aria-valuetext',
    '0,60',
  );
  await page.screenshot({ path: `${SHOTS}/journey-miembro-objetivo.png`, fullPage: true });

  // Un segundo check-in sobre A sube el puntaje: 100 de 100 => 1,00 y la banda en ruta.
  await checkInUi(page, kr(1, 'A'), { value: '100' });
  await expect(page.getByRole('meter', { name: `Score de ${titles[0]}` })).toHaveAttribute(
    'aria-valuetext',
    '0,70',
  );

  // Dashboard: el objetivo 1 muestra banda, barra y "3 de 3 KRs con check-in"; los otros siguen neutros.
  await page.goto(`/?cycleId=${quarterId}`);
  const mine = page.getByRole('region', { name: 'Objetivos individuales' });
  const first = mine.getByRole('link', { name: new RegExp(titles[0]) });
  await expect(first).toContainText('3 de 3 KRs con check-in');
  await expect(first).toContainText('En ruta');
  await expect(first.getByRole('meter')).toBeVisible();
  const second = mine.getByRole('link', { name: new RegExp(titles[1]) });
  await expect(second).toContainText('Sin check-ins');
  await expect(second).toContainText('0 de 3 KRs con check-in');
});
