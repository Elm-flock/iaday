import { randomInt } from 'node:crypto';
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import adminCredentials from './admin.json';

/**
 * Helpers compartidos de los e2e (contra el back REAL). La única fuente de verdad del admin sembrado es
 * `admin.json`: lo lee `scripts/e2e-stack.mjs` para el seed y los specs para loguearse y comparar el nombre.
 */
export const API = process.env.API_URL ?? 'http://localhost:3000';
export const SHOTS = 'e2e/__screenshots__';
export const PASSWORD = 'Miembro-Pass-123!';
/** Clave inicial que da administración: toda alta nace con `mustChangePassword` (hay que cambiarla antes de usar la API). */
export const INITIAL_PASSWORD = 'Inicial-Pass-123!';

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? adminCredentials.email,
  password: process.env.E2E_ADMIN_PASSWORD ?? adminCredentials.password,
  name: process.env.E2E_ADMIN_NAME ?? adminCredentials.name,
};

/** Sufijo único por archivo de spec para no chocar con datos de otras corridas ni de otros specs en paralelo. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomInt(36 ** 2).toString(36)}`;
}

/** Año lejano y aleatorio: los ciclos ANNUAL no se solapan entre specs en paralelo. */
export function uniqueYear(): number {
  return randomInt(2100, 9000);
}

export type Session = { token: string; id: string };
export type Role = 'MEMBER' | 'LEADER' | 'ADMIN';

export async function api<T = unknown>(
  request: APIRequestContext,
  method: 'post' | 'get' | 'put' | 'patch' | 'delete',
  path: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const response = await request[method](`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok(), `${method} ${path} -> ${response.status()}`).toBeTruthy();
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function loginApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<Session> {
  const response = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(response.ok(), `login ${email} -> ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, id: body.user.id };
}

export function loginAdminApi(request: APIRequestContext): Promise<Session> {
  return loginApi(request, ADMIN.email, ADMIN.password);
}

/** Login por la UI; termina en el Inicio (o en `next`, si se pasa y es interno). */
export async function loginUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
}

/** Una sesión de navegador aislada (cookies propias) para el usuario dado. */
export async function sessionFor(browser: Browser, email: string, password: string): Promise<Page> {
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();
  await loginUi(page, email, password);
  return page;
}

export const adminSession = (browser: Browser) => sessionFor(browser, ADMIN.email, ADMIN.password);

export type Person = { name: string; email: string };

export async function createUser(
  request: APIRequestContext,
  adminToken: string,
  person: Person,
  role: Role = 'MEMBER',
  password = PASSWORD,
): Promise<Session> {
  await onboardUser(request, adminToken, { ...person, role }, password);
  return loginApi(request, person.email, password);
}

/**
 * Alta de una persona lista para usar: la crea con clave inicial y hace el cambio obligatorio por API,
 * así los specs que no prueban ese flujo siguen entrando con `password`.
 */
/** Cambio obligatorio por API (la persona ya existe con `initial`). */
export async function completeForcedChange(
  request: APIRequestContext,
  email: string,
  initial: string,
  password = PASSWORD,
): Promise<void> {
  const first = await loginApi(request, email, initial);
  await api(request, 'post', '/auth/change-password', first.token, {
    currentPassword: initial,
    newPassword: password,
  });
}

export async function onboardUser(
  request: APIRequestContext,
  adminToken: string,
  body: Person & { role?: Role },
  password = PASSWORD,
): Promise<void> {
  await api(request, 'post', '/users', adminToken, { ...body, password: INITIAL_PASSWORD });
  await completeForcedChange(request, body.email, INITIAL_PASSWORD, password);
}

/** Ciclo anual + trimestre Q1, ambos activos. Devuelve ids. */
export async function seedActiveCycles(
  request: APIRequestContext,
  adminToken: string,
  year: number,
  suffix: string,
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' = 'WEEKLY',
) {
  const common = { checkInCadence: cadence, committedThreshold: 1, aspirationalThreshold: 0.7 };
  const annual = await api<{ id: string }>(request, 'post', '/cycles', adminToken, {
    name: `OKR ${year} ${suffix}`,
    kind: 'ANNUAL',
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    ...common,
  });
  const quarter = await api<{ id: string }>(request, 'post', '/cycles', adminToken, {
    name: `Q1 ${year} ${suffix}`,
    kind: 'QUARTER',
    parentId: annual.id,
    startDate: `${year}-01-01`,
    endDate: `${year}-03-31`,
    ...common,
  });
  await api(request, 'post', `/cycles/${annual.id}/activate`, adminToken);
  await api(request, 'post', `/cycles/${quarter.id}/activate`, adminToken);
  return { annualId: annual.id, quarterId: quarter.id };
}

export const dialog = (page: Page) => page.getByRole('dialog');

/** Enlace del menú lateral (los cards del Inicio, aún en el DOM por Activity, repiten nombres como "Check-ins"). */
export const navLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name });

/** Crea un equipo bajo la raíz y suma miembros (el primero con `lead: true` es líder). */
export async function seedTeam(
  request: APIRequestContext,
  adminToken: string,
  name: string,
  members: { id: string; lead?: boolean }[],
): Promise<string> {
  const tree = await api<{ id: string }[]>(request, 'get', '/teams', adminToken);
  const team = await api<{ id: string }>(request, 'post', '/teams', adminToken, {
    name,
    parentId: tree[0].id,
  });
  for (const member of members) {
    await api(
      request,
      'put',
      `/teams/${team.id}/members/${member.id}`,
      adminToken,
      member.lead ? { isLead: true } : {},
    );
  }
  return team.id;
}

export type SeededObjective = { id: string; title: string; krs: { id: string; title: string }[] };

/**
 * Objetivos con `krsEach` resultados clave DERIVED (0 -> 100), publicados. Quien llama pasa el token de
 * quien tiene permiso (responsable, líder o admin). Publicar exige >= 3 objetivos del mismo responsable.
 */
export async function seedPublishedObjectives(
  request: APIRequestContext,
  token: string,
  opts: {
    cycleId: string;
    owner: { ownerUserId: string } | { ownerTeamId: string };
    krOwnerId: string;
    label: string;
    origin?: 'TOP_DOWN' | 'BOTTOM_UP';
    count?: number;
    krsEach?: number;
    publish?: boolean;
  },
): Promise<SeededObjective[]> {
  const { count = 3, krsEach = 3, origin = 'BOTTOM_UP', publish = true } = opts;
  const created: SeededObjective[] = [];
  for (let n = 1; n <= count; n++) {
    const title = `${opts.label} ${n}`;
    const objective = await api<{ id: string }>(request, 'post', '/objectives', token, {
      cycleId: opts.cycleId,
      title,
      type: 'COMMITTED',
      origin,
      ...opts.owner,
    });
    const krs: SeededObjective['krs'] = [];
    for (let k = 1; k <= krsEach; k++) {
      const krTitle = `KR ${title}.${k}`;
      const kr = await api<{ id: string }>(
        request,
        'post',
        `/objectives/${objective.id}/key-results`,
        token,
        {
          title: krTitle,
          scoring: 'DERIVED',
          startValue: '0',
          targetValue: '100',
          unit: 'clientes',
          ownerId: opts.krOwnerId,
        },
      );
      krs.push({ id: kr.id, title: krTitle });
    }
    created.push({ id: objective.id, title, krs });
  }
  if (publish) {
    for (const o of created) await api(request, 'post', `/objectives/${o.id}/publish`, token);
  }
  return created;
}

/** Alta de objetivo por la UI; termina en el detalle del borrador. `owner` por etiqueta del select (persona o equipo). */
export async function createObjectiveUi(
  page: Page,
  cycleId: string,
  title: string,
  opts: {
    origin?: 'TOP_DOWN' | 'BOTTOM_UP';
    type?: 'COMMITTED' | 'ASPIRATIONAL';
    owner?: string;
  } = {},
) {
  await page.goto(`/objetivos/nuevo?cycleId=${cycleId}`);
  if (opts.owner) await page.getByLabel(/^Responsable/).selectOption({ label: opts.owner });
  await page.getByLabel(/^Título/).fill(title);
  await page.getByLabel(/^Tipo/).selectOption(opts.type ?? 'COMMITTED');
  await page.getByLabel(/^Origen/).selectOption(opts.origin ?? 'BOTTOM_UP');
  await page.getByRole('button', { name: 'Crear objetivo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/**
 * Agrega un KR por la UI. El botón de la vista y el submit del modal se llaman igual: se acota el de la
 * vista al encabezado de la card y se espera el cierre del modal antes y después (ver objetivos.spec).
 */
export async function addKeyResultUi(
  page: Page,
  kr: { title: string; manual?: boolean; start?: string; target?: string; unit?: string },
) {
  await expect(dialog(page)).toHaveCount(0);
  await page
    .getByRole('heading', { name: /^Resultados clave/ })
    .locator('xpath=ancestor::header[1]')
    .getByRole('button', { name: 'Agregar resultado clave' })
    .click();
  const modal = dialog(page);
  await modal.getByLabel(/^Resultado clave/).fill(kr.title);
  if (kr.manual) {
    await modal.getByLabel(/^Cómo se mide/).selectOption('MANUAL');
  } else {
    await modal.getByLabel(/^Valor inicial/).fill(kr.start ?? '0');
    await modal.getByLabel(/^Meta/).fill(kr.target ?? '100');
    await modal.getByLabel(/^Unidad/).fill(kr.unit ?? 'clientes');
  }
  await modal.getByRole('button', { name: 'Agregar resultado clave' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('row', { name: new RegExp(kr.title) })).toBeVisible();
}

/** Publica el objetivo abierto en `/objetivos/:id` confirmando el diálogo. */
export async function publishObjectiveUi(page: Page) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar objetivo' }).click();
  await expect(page.getByText('Publicado', { exact: true }).first()).toBeVisible();
}

/** Registra un check-in desde el drawer del KR: `value` (numérico) o `manualScore` (manual, "0.4"). */
export async function checkInUi(
  page: Page,
  krTitle: string,
  input: { value?: string; manualScore?: string; note?: string },
) {
  await page.getByRole('button', { name: `Registrar check-in de ${krTitle}` }).click();
  const drawer = page.getByRole('dialog', { name: 'Registrar check-in' });
  await expect(drawer).toBeVisible();
  if (input.value !== undefined) await drawer.getByLabel(/^Valor actual/).fill(input.value);
  if (input.manualScore !== undefined) {
    await drawer.getByLabel(/^Puntaje/).selectOption(input.manualScore);
  }
  if (input.note) await drawer.getByLabel(/^Nota/).fill(input.note);
  await drawer.getByRole('button', { name: 'Registrar check-in' }).click();
  await expect(page.getByRole('dialog', { name: 'Registrar check-in' })).toHaveCount(0);
}

/**
 * Espera a que React haya hidratado el elemento (tiene `__reactProps$`). Interactuar antes puede perderse:
 * la hidratación o un re-render posterior pisa lo tipeado o inyectado en el DOM. Úsese solo cuando el test
 * toca el DOM por fuera de Playwright (p. ej. inyectar una opción); las acciones normales ya reintentan.
 */
export async function waitUntilHydrated(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps$'))),
    )
    .toBe(true);
}
