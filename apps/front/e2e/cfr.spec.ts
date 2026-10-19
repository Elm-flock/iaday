import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  ADMIN,
  onboardUser,
  PASSWORD,
  SHOTS,
  loginApi,
  loginUi,
  uniqueSuffix,
  uniqueYear,
  api,
  waitUntilHydrated,
} from './helpers';

// Requiere el back real con un admin sembrado (ver CLAUDE.md > Testing). Los datos se preparan por API y
// los flujos de feedback y reconocimientos se recorren por la UI.

const suffix = uniqueSuffix();
const YEAR = uniqueYear();
const people = {
  a: { name: `Ana ${suffix}`, email: `ana.cfr.${suffix}@e2e.test` },
  b: { name: `Beto ${suffix}`, email: `beto.cfr.${suffix}@e2e.test` },
  c: { name: `Cami ${suffix}`, email: `cami.cfr.${suffix}@e2e.test` },
  d: { name: `Dani ${suffix}`, email: `dani.cfr.${suffix}@e2e.test` },
};
type Who = keyof typeof people;

const highKr = `Clientes ${suffix}`;
const almostKr = `Casi llegamos ${suffix}`;
const FEEDBACK_TEXT = `Ordenaste la reunión y nos ahorró tiempo ${suffix}`;
const FEEDBACK_EDITED = `Ordenaste la reunión; la próxima, compartí la agenda antes ${suffix}`;
const RECOGNITION_TEXT = `Cerraste dos cuentas grandes ${suffix}`;

const ctx = {
  cycleId: '',
  ids: {} as Record<Who, string>,
  tokens: {} as Record<Who, string>,
  objectiveTitle: `Objetivo 1 ${suffix}`,
  feedbackId: '',
};

/** Una sesión de navegador aislada por persona (cookies propias). */
async function sessionFor(browser: Browser, who: Who | 'admin'): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (who === 'admin') await loginUi(page, ADMIN.email, ADMIN.password);
  else await loginUi(page, people[who].email, PASSWORD);
  return page;
}

async function expectNotFound(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await expect(page.getByText(FEEDBACK_TEXT)).toHaveCount(0);
  await expect(page.getByText(FEEDBACK_EDITED)).toHaveCount(0);
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('CFR: feedback privado y reconocimientos (contra el back real)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginApi(request, ADMIN.email, ADMIN.password);
    const cycleBody = {
      checkInCadence: 'WEEKLY',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    };
    const annual = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `OKR ${YEAR} cfr ${suffix}`,
      kind: 'ANNUAL',
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
      ...cycleBody,
    });
    const quarter = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `Q1 ${YEAR} cfr ${suffix}`,
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
      await onboardUser(request, admin.token, { ...people[who], role: 'MEMBER' });
      const session = await loginApi(request, people[who].email, PASSWORD);
      ctx.ids[who] = session.id;
      ctx.tokens[who] = session.token;
    }

    // Ana: 3 objetivos con 3 KRs; en el primero, un KR llega a 0,80 y otro queda en 0,69.
    const created: { id: string; krs: { id: string; title: string }[] }[] = [];
    for (const n of [1, 2, 3]) {
      const objective = await api<{ id: string }>(request, 'post', '/objectives', ctx.tokens.a, {
        cycleId: ctx.cycleId,
        ownerUserId: ctx.ids.a,
        title: `Objetivo ${n} ${suffix}`,
        type: 'COMMITTED',
        origin: 'BOTTOM_UP',
      });
      const krs: { id: string; title: string }[] = [];
      const titles =
        n === 1
          ? [highKr, almostKr, `Extra ${suffix}`]
          : [1, 2, 3].map((k) => `KR ${n}.${k} ${suffix}`);
      for (const title of titles) {
        const kr = await api<{ id: string }>(
          request,
          'post',
          `/objectives/${objective.id}/key-results`,
          ctx.tokens.a,
          {
            title,
            scoring: 'DERIVED',
            startValue: '0',
            targetValue: '100',
            unit: 'clientes',
            ownerId: ctx.ids.a,
          },
        );
        krs.push({ id: kr.id, title });
      }
      created.push({ id: objective.id, krs });
    }
    // Publicar exige >= 3 objetivos del responsable: recién cuando existen los tres.
    for (const o of created) {
      await api(request, 'post', `/objectives/${o.id}/publish`, ctx.tokens.a);
    }
    const [first] = created;
    await api(request, 'post', `/key-results/${first.krs[0].id}/check-ins`, ctx.tokens.a, {
      action: 'UPDATE',
      value: '80',
    });
    await api(request, 'post', `/key-results/${first.krs[1].id}/check-ins`, ctx.tokens.a, {
      action: 'UPDATE',
      value: '69',
    });
    await request.dispose();
  });

  test('A le da feedback a B por la UI: no puede elegirse a sí misma y el aviso de privacidad se ve', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, 'a');
    await page.goto('/feedback/nuevo');
    await expect(
      page.getByText('Solo vos y la otra persona pueden ver este feedback.').first(),
    ).toBeVisible();

    const recipient = page.getByLabel(/Para quién/);
    await expect(recipient.locator('option', { hasText: people.a.name })).toHaveCount(0);
    await expect(recipient.locator('option', { hasText: people.b.name })).toHaveCount(1);

    await recipient.selectOption({ label: people.b.name });
    await page.getByLabel(/^Mensaje/).fill(FEEDBACK_TEXT);
    await page
      .getByLabel(/Objetivo o resultado clave relacionado/)
      .selectOption({ label: `Resultado clave: ${highKr} (${ctx.objectiveTitle})` });
    await page.getByRole('button', { name: 'Enviar feedback' }).click();

    await expect(page).toHaveURL(/\/feedback\?box=sent/);
    await expect(page.getByText(/Enviamos tu feedback/)).toBeVisible();
    await expect(page.getByText(`Para ${people.b.name}`)).toBeVisible();
    await expect(page.getByText('Sin leer')).toHaveCount(0);

    const sent = await api<{ id: string }[]>(
      page.request,
      'get',
      '/feedback?box=sent',
      ctx.tokens.a,
    );
    ctx.feedbackId = sent[0].id;
    await page.context().close();
  });

  test('B lo ve "Sin leer", lo abre y queda leído; A ve "Leído"', async ({ browser }) => {
    const page = await sessionFor(browser, 'b');
    await page.goto('/feedback');
    await expect(page.getByRole('link', { name: /Recibido/ })).toContainText('1 sin leer');
    await expect(
      page.getByText('Sin leer', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText(`De ${people.a.name}`)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/feedback-bandeja.png`, fullPage: true });

    await page.getByRole('link', { name: new RegExp(`De ${people.a.name}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/feedback/${ctx.feedbackId}`));
    await expect(page.getByTestId('feedback-content')).toHaveText(FEEDBACK_TEXT);
    await expect(page.getByRole('link', { name: new RegExp(highKr) })).toBeVisible();
    // Receptor: ni editar ni eliminar.
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
    // La Server Action marca como leído y refresca: desaparece "Sin leer".
    await expect(page.getByText('Sin leer', { exact: true }).filter({ visible: true })).toHaveCount(
      0,
    );
    await page.screenshot({ path: `${SHOTS}/feedback-detalle.png`, fullPage: true });

    await page.goto('/feedback');
    await expect(page.getByText('Sin leer', { exact: true }).filter({ visible: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: /Recibido/ })).not.toContainText('sin leer');
    await page.context().close();

    const author = await sessionFor(browser, 'a');
    await author.goto('/feedback?box=sent');
    await expect(author.getByText('Leído', { exact: true })).toBeVisible();
    await author.context().close();
  });

  test('una tercera persona (C) y ADMIN no lo ven: ni en listas ni por URL directa (404)', async ({
    browser,
  }) => {
    for (const who of ['c', 'admin'] as const) {
      const page = await sessionFor(browser, who);
      for (const box of ['received', 'sent']) {
        await page.goto(`/feedback?box=${box}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();
        await expect(page.getByText(/^Todavía no (recibiste|enviaste) feedback$/)).toBeVisible();
        await expect(page.getByText(FEEDBACK_TEXT)).toHaveCount(0);
        await expect(page.getByText(people.a.name)).toHaveCount(0);
      }
      await expectNotFound(page, `/feedback/${ctx.feedbackId}`);
      await page.context().close();
    }
  });

  test('A edita su feedback (B ve el cambio) y lo elimina con confirmación', async ({
    browser,
  }) => {
    const author = await sessionFor(browser, 'a');
    await author.goto(`/feedback/${ctx.feedbackId}`);
    await author.getByRole('button', { name: 'Editar' }).click();
    const dialog = author.getByRole('dialog', { name: 'Editar feedback' });
    await dialog.getByLabel(/^Mensaje/).fill(FEEDBACK_EDITED);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(author.getByTestId('feedback-content')).toHaveText(FEEDBACK_EDITED);

    const receiver = await sessionFor(browser, 'b');
    await receiver.goto(`/feedback/${ctx.feedbackId}`);
    await expect(receiver.getByTestId('feedback-content')).toHaveText(FEEDBACK_EDITED);
    await receiver.context().close();

    await author.getByRole('button', { name: 'Eliminar' }).click();
    const confirm = author.getByRole('alertdialog', { name: 'Eliminar feedback' });
    await confirm.getByRole('button', { name: 'Eliminar feedback' }).click();
    await expect(author).toHaveURL(/\/feedback\?box=sent/);
    await expect(author.getByText(/Eliminamos el feedback/)).toBeVisible();
    await author.context().close();

    const gone = await sessionFor(browser, 'b');
    await expectNotFound(gone, `/feedback/${ctx.feedbackId}`);
    await gone.context().close();
  });

  test('D reconoce a A por un KR >= 0,70: el KR de 0,69 no se ofrece y el reconocimiento aparece en el muro', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, 'd');
    await page.goto('/reconocimientos/nuevo');

    const person = page.getByLabel(/^Persona/);
    await expect(person.locator('option', { hasText: people.d.name })).toHaveCount(0);
    await person.selectOption({ label: people.a.name });
    await page.getByRole('button', { name: 'Continuar' }).click();

    const milestone = page.getByLabel(/^Logro/);
    await expect(milestone).toBeVisible();
    await expect(milestone.locator('option', { hasText: highKr })).toHaveCount(1);
    await expect(milestone.locator('option', { hasText: highKr })).toContainText('0,80');
    await expect(milestone.locator('option', { hasText: almostKr })).toHaveCount(0);
    await expect(page.getByText(/0,70 o más, o un objetivo ya cerrado/)).toBeVisible();

    await milestone.selectOption({
      label: `Resultado clave: ${highKr} (${ctx.objectiveTitle}) · 0,80`,
    });
    await page.getByLabel(/^Mensaje/).fill(RECOGNITION_TEXT);
    await page.getByRole('button', { name: 'Reconocer logro' }).click();

    await expect(page).toHaveURL(/\/reconocimientos\?creado=1/);
    await expect(page.getByText(/Enviamos el reconocimiento/)).toBeVisible();
    const card = page.getByRole('article').filter({ hasText: RECOGNITION_TEXT });
    await expect(card).toContainText(people.d.name);
    await expect(card).toContainText(people.a.name);
    await expect(card.getByTestId('recognition-milestone')).toContainText(highKr);
    await expect(card.getByTestId('recognition-milestone')).toContainText('En ruta');
    await expect(card.getByTestId('recognition-milestone')).toContainText('Puntaje 0,80');
    // Sin ranking ni conteos por persona.
    await expect(page.getByText(/ranking|más reconocid|top /i)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/reconocimientos-muro.png`, fullPage: true });

    // Filtro por persona: A lo ve; B (sin reconocimientos) no.
    await page.getByLabel('Filtrar por persona').selectOption({ label: people.a.name });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('article').filter({ hasText: RECOGNITION_TEXT })).toBeVisible();
    await page.getByLabel('Filtrar por persona').selectOption({ label: people.b.name });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByText('Todavía no hay reconocimientos para esta persona')).toBeVisible();
    await page.context().close();
  });

  test('el back rechaza un hito que no lo es (0,69) con el copy de la regla', async ({
    browser,
  }) => {
    // Se fuerza el POST con un KR de 0,69 desde la sesión de D (la UI no lo ofrece): el error del back se muestra.
    const page = await sessionFor(browser, 'd');
    await page.goto('/reconocimientos/nuevo');
    await page.getByLabel(/^Persona/).selectOption({ label: people.a.name });
    await page.getByRole('button', { name: 'Continuar' }).click();
    const milestone = page.getByLabel(/^Logro/);
    await expect(milestone).toBeVisible();
    // El <select> es de React: inyectarle una opción antes de hidratar (o de un re-render) la pierde.
    await waitUntilHydrated(milestone);

    // Inyecta una opción con el KR de 0,69 (id real por API) para simular una vista desactualizada.
    const objectives = await api<{ id: string; keyResults: { id: string; title: string }[] }[]>(
      page.request,
      'get',
      `/objectives?ownerUserId=${ctx.ids.a}`,
      ctx.tokens.d,
    );
    const objective = objectives.find((o) => o.keyResults.some((k) => k.title === almostKr))!;
    const kr = objective.keyResults.find((k) => k.title === almostKr)!;
    await milestone.evaluate((el, value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = 'KR desactualizado';
      el.appendChild(option);
    }, `kr:${objective.id}:${kr.id}`);
    await milestone.selectOption('KR desactualizado');
    await page.getByLabel(/^Mensaje/).fill(`No debería crearse ${suffix}`);
    await page.getByRole('button', { name: 'Reconocer logro' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'todavía no es un hito' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/reconocimientos\/nuevo/);
    await page.context().close();
  });
});
