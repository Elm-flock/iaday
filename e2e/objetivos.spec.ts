import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Requiere el back real con un admin sembrado (ver CLAUDE.md > Testing). Los datos se preparan por API
// (admin: ciclo activo y usuarios) y los flujos de OKRs se recorren por la UI con los usuarios reales.
const API = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2e-Password-123!';
const SHOTS = 'e2e/__screenshots__';

const suffix = Date.now().toString(36);
const YEAR = 2100 + (Date.now() % 800);
const PASSWORD = 'Miembro-Pass-123!';
const ana = { name: `Ana ${suffix}`, email: `ana.${suffix}@e2e.test` };
const beto = { name: `Beto ${suffix}`, email: `beto.${suffix}@e2e.test` };

type Session = { token: string; id: string };
const ctx: { cycleId: string; ana: Session; beto: Session; draftId: string } = {
  cycleId: '',
  ana: { token: '', id: '' },
  beto: { token: '', id: '' },
  draftId: '',
};

const titles = [1, 2, 3].map((n) => `Objetivo ${n} ${suffix}`);

async function api<T>(
  request: APIRequestContext,
  method: 'post' | 'get',
  path: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const response = await request[method](`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok(), `${method} ${path} -> ${response.status()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function loginApi(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, id: body.user.id };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
}

const dialog = (page: Page) => page.getByRole('dialog');

async function createObjectiveUi(page: Page, title: string) {
  await page.goto(`/objetivos/nuevo?cycleId=${ctx.cycleId}`);
  await page.getByLabel(/^Título/).fill(title);
  await page.getByLabel(/^Tipo/).selectOption('COMMITTED');
  await page.getByLabel(/^Origen/).selectOption('BOTTOM_UP');
  await page.getByRole('button', { name: 'Crear objetivo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function addKrUi(page: Page, title: string, start: string, target: string) {
  await page.getByRole('button', { name: 'Agregar resultado clave' }).click();
  await dialog(page)
    .getByLabel(/^Resultado clave/)
    .fill(title);
  await dialog(page)
    .getByLabel(/^Valor inicial/)
    .fill(start);
  await dialog(page).getByLabel(/^Meta/).fill(target);
  await dialog(page)
    .getByLabel(/^Unidad/)
    .fill('clientes');
  await dialog(page).getByRole('button', { name: 'Agregar resultado clave' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('objetivos (miembros reales contra el back)', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginApi(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const annual = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `OKR ${YEAR} ${suffix}`,
      kind: 'ANNUAL',
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
      checkInCadence: 'WEEKLY',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    });
    const quarter = await api<{ id: string }>(request, 'post', '/cycles', admin.token, {
      name: `Q1 ${YEAR} ${suffix}`,
      kind: 'QUARTER',
      parentId: annual.id,
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-03-31`,
      checkInCadence: 'WEEKLY',
      committedThreshold: 1,
      aspirationalThreshold: 0.7,
    });
    await api(request, 'post', `/cycles/${annual.id}/activate`, admin.token);
    await api(request, 'post', `/cycles/${quarter.id}/activate`, admin.token);
    ctx.cycleId = quarter.id;
    for (const person of [ana, beto]) {
      await api(request, 'post', '/users', admin.token, {
        ...person,
        password: PASSWORD,
        role: 'MEMBER',
      });
    }
    ctx.ana = await loginApi(request, ana.email, PASSWORD);
    ctx.beto = await loginApi(request, beto.email, PASSWORD);
    await request.dispose();
  });

  test('un miembro crea 3 objetivos con 3 KRs cada uno y los publica', async ({ page }) => {
    await login(page, ana.email, PASSWORD);

    // El alta explica a quién puede asignar y no ofrece más opciones que a sí mismo.
    await page.goto(`/objetivos/nuevo?cycleId=${ctx.cycleId}`);
    await expect(page.getByText('Solo podés crear objetivos propios.')).toBeVisible();
    await expect(page.getByLabel(/^Responsable/).locator('option:not([disabled])')).toHaveCount(1);

    for (const title of titles) {
      await createObjectiveUi(page, title);
      await expect(page.getByText('Es un borrador')).toBeVisible();
      await addKrUi(page, `KR A de ${title}`, '0', '100');
      await addKrUi(page, `KR B de ${title}`, '10', '1.000,5');
      await addKrUi(page, `KR C de ${title}`, '5', '0');
      await expect(
        page.getByRole('heading', { name: /Resultados clave \(3 de 5\)/ }),
      ).toBeVisible();
    }

    // Publicar: la confirmación explica la regla ≥3 / ≥3 y se publica con los 3 objetivos listos.
    for (const title of titles) {
      await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
      await page.getByRole('link', { name: new RegExp(title) }).click();
      await page.getByRole('button', { name: 'Publicar', exact: true }).click();
      await expect(page.getByRole('alertdialog')).toContainText(
        'al menos 3 objetivos del mismo responsable',
      );
      await expect(page.getByRole('alertdialog')).toContainText('al menos 3 resultados clave');
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Publicar objetivo' })
        .click();
      await expect(page.getByText('Publicado', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
    }

    // Lista: cupo, etiquetas, banda y score (updateTag refresca la cache privada).
    await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
    await expect(page.getByTestId('limit-indicator')).toHaveText('3 de 5 objetivos');
    await expect(page.getByText('Comprometido').first()).toBeVisible();
    await expect(page.getByText('Bottom-up').first()).toBeVisible();
    await expect(page.getByText('Sin check-ins').first()).toBeVisible();
    await expect(page.getByText(/En riesgo/)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/objetivos-lista.png`, fullPage: true });
  });

  test('el 6.º objetivo se bloquea con un mensaje claro en español', async ({ page, request }) => {
    // Dos borradores más por API (3 publicados + 2 = 5); el 4.º lleva solo 2 KRs.
    const body = (title: string) => ({
      cycleId: ctx.cycleId,
      ownerUserId: ctx.ana.id,
      title,
      type: 'ASPIRATIONAL',
      origin: 'TOP_DOWN',
    });
    const draft = await api<{ id: string }>(
      request,
      'post',
      '/objectives',
      ctx.ana.token,
      body(`Objetivo 4 ${suffix}`),
    );
    ctx.draftId = draft.id;
    await api(request, 'post', '/objectives', ctx.ana.token, body(`Objetivo 5 ${suffix}`));
    for (const n of [1, 2]) {
      await api(request, 'post', `/objectives/${draft.id}/key-results`, ctx.ana.token, {
        title: `KR ${n} del borrador`,
        scoring: 'MANUAL',
        ownerId: ctx.ana.id,
      });
    }

    await login(page, ana.email, PASSWORD);
    await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
    await expect(page.getByTestId('limit-indicator')).toHaveText('5 de 5 objetivos');
    await expect(page.getByText('Llegó al máximo')).toBeVisible();

    await page.goto(`/objetivos/nuevo?cycleId=${ctx.cycleId}`);
    await page.getByLabel(/^Título/).fill(`Objetivo 6 ${suffix}`);
    await page.getByLabel(/^Tipo/).selectOption('COMMITTED');
    await page.getByLabel(/^Origen/).selectOption('TOP_DOWN');
    await page.getByRole('button', { name: 'Crear objetivo' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '5 objetivos' })).toContainText(
      'Eliminá un borrador o elegí otro ciclo.',
    );
    // No se pierde lo tipeado.
    await expect(page.getByLabel(/^Título/)).toHaveValue(`Objetivo 6 ${suffix}`);
  });

  test('publicar con 2 KRs muestra el copy de MIN_KRS_NOT_MET', async ({ page }) => {
    await login(page, ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.draftId}`);
    await expect(page.getByRole('heading', { name: /Resultados clave \(2 de 5\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar objetivo' }).click();
    await expect(
      page.getByText(
        'Para publicar, el objetivo necesita al menos 3 resultados clave. Agregá los que faltan y volvé a publicar.',
      ),
    ).toBeVisible();
  });

  test('otro miembro ve el objetivo publicado pero no el borrador', async ({ page }) => {
    await login(page, beto.email, PASSWORD);
    await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
    await expect(page.getByRole('link', { name: new RegExp(titles[0]) })).toBeVisible();
    await expect(page.getByText(`Objetivo 4 ${suffix}`)).toHaveCount(0);
    await expect(page.getByText(`Objetivo 5 ${suffix}`)).toHaveCount(0);
    // Del otro no se afirma un cupo: solo ve los publicados.
    await expect(page.getByText('3 objetivos publicados')).toBeVisible();

    // El detalle de un borrador ajeno es un 404 (no filtra su existencia).
    await page.goto(`/objetivos/${ctx.draftId}`);
    await expect(page.getByText(`Objetivo 4 ${suffix}`)).toHaveCount(0);
    await expect(page.getByText(/could not be found|no se encontr/i)).toBeVisible();

    // Un objetivo ajeno publicado se ve, sin acciones de edición.
    await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
    await page.getByRole('link', { name: new RegExp(titles[0]) }).click();
    await expect(page.getByRole('heading', { level: 1, name: titles[0] })).toBeVisible();
    await expect(page.getByText('Solo lo puede modificar su responsable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  });

  test('tras publicar, la meta del KR está deshabilitada para el miembro y se explica por qué', async ({
    page,
  }) => {
    await login(page, ana.email, PASSWORD);
    await page.goto(`/objetivos?cycleId=${ctx.cycleId}`);
    await page.getByRole('link', { name: new RegExp(titles[0]) }).click();
    await expect(page.getByRole('heading', { level: 1, name: titles[0] })).toBeVisible();

    // Alineación y detalle de KRs con formato AR.
    await expect(page.getByText('No está alineado a otro objetivo.')).toBeVisible();
    await expect(page.getByText('1.000,5')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/objetivo-detalle.png`, fullPage: true });

    await page.getByRole('button', { name: new RegExp(`^Editar KR A de ${titles[0]}`) }).click();
    await expect(dialog(page).getByLabel(/^Meta/)).toBeDisabled();
    await expect(dialog(page).getByLabel(/^Valor inicial/)).toBeDisabled();
    await expect(dialog(page).getByTestId('target-locked-reason')).toContainText(
      'solo el líder o administración pueden cambiar el inicio y la meta',
    );
    // El título sí se puede editar.
    await dialog(page)
      .getByLabel(/^Resultado clave/)
      .fill(`KR A renombrado ${suffix}`);
    await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByRole('row', { name: new RegExp(`KR A renombrado ${suffix}`) }),
    ).toBeVisible();

    // Tipo y origen del objetivo también quedan bloqueados con la razón.
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(dialog(page).getByLabel(/^Tipo/)).toBeDisabled();
    await expect(dialog(page).getByLabel(/^Origen/)).toBeDisabled();
    await expect(
      dialog(page)
        .getByText('Después de publicar no se pueden cambiar el tipo ni el origen.')
        .first(),
    ).toBeVisible();
  });

  test('los toasts se cierran solos y no tapan los botones de la vista', async ({ page }) => {
    await login(page, ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.draftId}`);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await dialog(page)
      .getByLabel(/^Título/)
      .fill(`Objetivo 4 ${suffix} editado`);
    await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click();
    const toast = page.getByRole('region', { name: 'Notificaciones' }).getByRole('status');
    await expect(toast).toContainText('Guardamos los cambios del objetivo.');
    // Un clic sobre el botón primario de la vista funciona aunque el toast siga visible.
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(toast).toHaveCount(0, { timeout: 8000 });
  });
});
