import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  adminSession,
  createUser,
  loginAdminApi,
  sessionFor,
  uniqueSuffix,
} from '../helpers';

/**
 * Privacidad del feedback: A le escribe a B. Ni C ni ADMIN lo ven (listas vacías y 404 en español por URL
 * directa); B lo lee y queda leído; A lo edita y aparece "Editado".
 */
const suffix = uniqueSuffix();
const people = {
  a: { name: `Alma Autora ${suffix}`, email: `alma.fb.${suffix}@e2e.test` },
  b: { name: `Bruno Receptor ${suffix}`, email: `bruno.fb.${suffix}@e2e.test` },
  c: { name: `Carla Ajena ${suffix}`, email: `carla.fb.${suffix}@e2e.test` },
};
const TEXT = `Ordenaste la reunión y ahorramos tiempo ${suffix}`;
const EDITED = `Ordenaste la reunión; la próxima compartí la agenda antes ${suffix}`;

test('A -> B: invisible para C y ADMIN, B lo lee, A lo edita y se marca "Editado"', async ({
  browser,
  playwright,
}) => {
  test.setTimeout(150_000);
  const request = await playwright.request.newContext();
  const admin = await loginAdminApi(request);
  await createUser(request, admin.token, people.a);
  await createUser(request, admin.token, people.b);
  await createUser(request, admin.token, people.c);
  await request.dispose();

  // A escribe por la UI (no puede elegirse a sí misma).
  const author = await sessionFor(browser, people.a.email, PASSWORD);
  await author.goto('/feedback/nuevo');
  const recipient = author.getByLabel(/Para quién/);
  await expect(recipient.locator('option', { hasText: people.a.name })).toHaveCount(0);
  await recipient.selectOption({ label: people.b.name });
  await author.getByLabel(/^Mensaje/).fill(TEXT);
  await author.getByRole('button', { name: 'Enviar feedback' }).click();
  await expect(author).toHaveURL(/\/feedback\?box=sent/);
  await author.getByRole('link', { name: new RegExp(`Para ${people.b.name}`) }).click();
  await expect(author).toHaveURL(/\/feedback\/[0-9a-f-]{36}$/);
  const feedbackUrl = author.url();
  await expect(author.getByTestId('feedback-content')).toHaveText(TEXT);
  await expect(author.getByText('Editado')).toHaveCount(0);

  // C y ADMIN: ni en las bandejas ni por URL directa.
  for (const who of ['c', 'admin'] as const) {
    const page =
      who === 'admin'
        ? await adminSession(browser)
        : await sessionFor(browser, people.c.email, PASSWORD);
    for (const box of ['received', 'sent']) {
      await page.goto(`/feedback?box=${box}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
      await expect(page.getByText(TEXT)).toHaveCount(0);
      await expect(page.getByText(people.a.name)).toHaveCount(0);
    }
    await page.goto(feedbackUrl);
    await expect(page.getByText('No encontramos esta página')).toBeVisible();
    await expect(page.getByText(TEXT)).toHaveCount(0);
    await page.context().close();
  }

  // B lo ve "Sin leer", lo abre y queda leído.
  const receiver = await sessionFor(browser, people.b.email, PASSWORD);
  await receiver.goto('/feedback');
  await expect(
    receiver.getByText('Sin leer', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await receiver.goto(feedbackUrl);
  await expect(receiver.getByTestId('feedback-content')).toHaveText(TEXT);
  await expect(
    receiver.getByText('Sin leer', { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);

  // A edita: B ve el cambio con la marca "Editado" (ícono + palabra).
  await author.getByRole('button', { name: 'Editar' }).click();
  const dialog = author.getByRole('dialog', { name: 'Editar feedback' });
  await dialog.getByLabel(/^Mensaje/).fill(EDITED);
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(author.getByTestId('feedback-content')).toHaveText(EDITED);
  await expect(author.getByText('Editado').first()).toBeVisible();

  await receiver.goto(feedbackUrl);
  await expect(receiver.getByTestId('feedback-content')).toHaveText(EDITED);
  await expect(receiver.getByText('Editado').first()).toBeVisible();

  await author.context().close();
  await receiver.context().close();
});
