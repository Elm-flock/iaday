import { expect, test, type Page } from '@playwright/test';

// Requiere el back real con un admin sembrado (ver CLAUDE.md > Testing). Los datos se crean con un
// sufijo único para poder repetir la corrida sobre la misma base.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2e-Password-123!';
const SHOTS = 'e2e/__screenshots__';

const suffix = Date.now().toString(36);
const YEAR = 2100 + (Date.now() % 800); // año lejano: evita choques con datos de otras corridas
const annualName = `OKR ${YEAR} ${suffix}`;
const quarterName = `Q1 ${YEAR} ${suffix}`;
const overlapName = `Q-solapado ${suffix}`;
const teamName = `Equipo ${suffix}`;
const memberName = `Beto ${suffix}`;
const memberEmail = `beto.${suffix}@e2e.test`;
const memberPassword = 'Miembro-Pass-123!';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
}

const dialog = (page: Page) => page.getByRole('dialog');

/** Elige el ciclo anual creado en este test por su texto (selectOption no acepta regex). */
async function pickAnnual(page: Page) {
  const option = dialog(page)
    .getByLabel(/Ciclo anual/)
    .locator('option', { hasText: annualName });
  await dialog(page)
    .getByLabel(/Ciclo anual/)
    .selectOption((await option.getAttribute('value')) as string);
}

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.describe('ciclos, equipos y usuarios (admin)', () => {
  test('admin crea un ciclo anual y un trimestre, los activa y ve los umbrales', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.getByRole('link', { name: 'Ciclos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ciclos' })).toBeVisible();

    // Anual
    await page.getByRole('button', { name: 'Crear ciclo' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill(annualName);
    await dialog(page)
      .getByLabel(/Inicio/)
      .fill(`${YEAR}-01-01`);
    await dialog(page).getByLabel(/Fin/).fill(`${YEAR}-12-31`);
    await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();

    // updateTag: la lista (cache privada del browser) se refresca sin recargar.
    const annualRow = page.getByRole('region', { name: annualName });
    await expect(annualRow).toBeVisible();
    await expect(annualRow.getByText('Borrador')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Notificaciones' })).toContainText(
      `Creamos el ciclo "${annualName}"`,
    );

    // Trimestre
    await page.getByRole('button', { name: 'Crear ciclo' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill(quarterName);
    await dialog(page).getByLabel(/Tipo/).selectOption('QUARTER');
    await pickAnnual(page);
    await dialog(page)
      .getByLabel(/Inicio/)
      .fill(`${YEAR}-01-01`);
    await dialog(page).getByLabel(/Fin/).fill(`${YEAR}-03-31`);
    await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();
    await expect(annualRow.getByRole('link', { name: quarterName })).toBeVisible();
    await expect(annualRow.getByText(`01/01/${YEAR} al 31/03/${YEAR}`)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ciclos-lista.png`, fullPage: true });

    // Detalle del anual: umbrales por defecto con coma decimal; activar con confirmación.
    await annualRow.getByRole('link', { name: annualName }).click();
    await expect(page.getByRole('heading', { level: 1, name: annualName })).toBeVisible();
    await expect(page.getByTestId('committed-threshold')).toHaveText('1,00');
    await expect(page.getByTestId('aspirational-threshold')).toHaveText('0,70');
    await expect(page.getByText(`01/01/${YEAR}`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Activar ciclo' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Al activar');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Activar ciclo' }).click();
    await expect(page.getByText('Activo', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar ciclo' })).toBeVisible();

    // Editar umbrales (permitido hasta el cierre).
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await dialog(page)
      .getByLabel(/Umbral de aspiracionales/)
      .fill('0,65');
    await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByTestId('aspirational-threshold')).toHaveText('0,65');
  });

  test('un trimestre solapado se rechaza con un mensaje claro en español', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/ciclos');
    await page.getByRole('button', { name: 'Crear ciclo' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill(overlapName);
    await dialog(page).getByLabel(/Tipo/).selectOption('QUARTER');
    await pickAnnual(page);
    await dialog(page)
      .getByLabel(/Inicio/)
      .fill(`${YEAR}-03-01`);
    await dialog(page).getByLabel(/Fin/).fill(`${YEAR}-04-30`);
    await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();

    await expect(dialog(page).getByRole('alert')).toContainText(
      'Ese trimestre se superpone con otro del mismo ciclo anual. Elegí fechas que no se pisen con los trimestres existentes.',
    );
    // No se pierde lo tipeado y el modal sigue abierto para corregir.
    await expect(dialog(page).getByLabel(/Nombre/)).toHaveValue(overlapName);

    // Fuera del rango del anual: otro error claro.
    await dialog(page)
      .getByLabel(/Inicio/)
      .fill(`${YEAR + 1}-01-01`);
    await dialog(page)
      .getByLabel(/Fin/)
      .fill(`${YEAR + 1}-02-01`);
    await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText(
      'Las fechas del trimestre tienen que estar dentro de las del ciclo anual.',
    );
  });

  test('admin crea un usuario, un equipo y agrega al usuario como líder', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Usuario
    await page.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill(memberName);
    await dialog(page).getByLabel(/Email/).fill(memberEmail);
    await dialog(page)
      .getByLabel(/Contraseña inicial/)
      .fill(memberPassword);
    await dialog(page).getByRole('button', { name: 'Crear usuario' }).click();
    const row = page.getByRole('row', { name: new RegExp(memberName) });
    await expect(row).toContainText(memberEmail);
    await expect(row).toContainText('Activo');

    // Email repetido: error claro.
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill('Otra persona');
    await dialog(page).getByLabel(/Email/).fill(memberEmail);
    await dialog(page)
      .getByLabel(/Contraseña inicial/)
      .fill(memberPassword);
    await dialog(page).getByRole('button', { name: 'Crear usuario' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText(
      'Ya existe un usuario con ese email',
    );
    await dialog(page).getByRole('button', { name: 'Cancelar' }).click();
    await page.screenshot({ path: `${SHOTS}/admin-usuarios.png`, fullPage: true });

    // Equipo
    await page.getByRole('link', { name: 'Equipos' }).click();
    await page.getByRole('button', { name: 'Crear equipo' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill(teamName);
    await dialog(page)
      .getByLabel(/Equipo padre/)
      .selectOption({ index: 1 });
    await dialog(page).getByRole('button', { name: 'Crear equipo' }).click();
    await expect(page.getByRole('link', { name: teamName })).toBeVisible();

    // Miembro como líder
    await page.getByRole('link', { name: teamName }).click();
    await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible();
    await expect(page.getByText('Este equipo todavía no tiene integrantes')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar integrante' }).click();
    await dialog(page)
      .getByLabel(/Persona/)
      .selectOption({ label: memberName });
    await dialog(page).getByRole('switch', { name: 'Es líder del equipo' }).check();
    await dialog(page).getByRole('button', { name: 'Agregar al equipo' }).click();

    const members = page.locator('section', {
      has: page.getByRole('heading', { name: 'Integrantes' }),
    });
    await expect(members.getByText(memberName)).toBeVisible();
    await expect(members.getByText('Líder', { exact: true })).toBeVisible();

    // Indicador 50/50 con el ciclo activo por defecto (sin objetivos todavía).
    await expect(page.getByText('Mezcla de objetivos (50/50)')).toBeVisible();
    await expect(
      page.getByText(/Todavía no hay objetivos|Equilibrado|Fuera del rango/),
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/equipos-detalle.png`, fullPage: true });

    // Quitar liderazgo (acción inline) y persistencia tras recargar.
    await page.getByRole('button', { name: 'Quitar liderazgo' }).click();
    await expect(members.getByText('Líder', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(members.getByText(memberName)).toBeVisible();
  });

  test('updateTag: tras crear un ciclo, otra ruta ya cacheada en el browser muestra el dato nuevo', async ({
    page,
  }) => {
    const freshName = `Fresco ${suffix}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // 1) Se visita el detalle del equipo por navegación cliente: queda en la cache del router
    //    (`'use cache: private'` + stale 60 s) con la lista de ciclos de ese momento.
    await page.getByRole('link', { name: 'Equipos' }).click();
    await page.getByRole('link', { name: teamName }).click();
    const cycleSelect = page.getByLabel('Ciclo', { exact: true });
    await expect(cycleSelect).toBeVisible();
    await expect(cycleSelect.locator('option', { hasText: freshName })).toHaveCount(0);

    // 2) Se crea un ciclo con una Server Action que llama a updateTag('cycles').
    await page.getByRole('link', { name: 'Ciclos' }).click();
    await page.getByRole('button', { name: 'Crear ciclo' }).click();
    await dialog(page)
      .getByLabel(/Nombre/)
      .fill(freshName);
    await dialog(page)
      .getByLabel(/Inicio/)
      .fill('2999-01-01');
    await dialog(page).getByLabel(/Fin/).fill('2999-12-31');
    await dialog(page).getByRole('button', { name: 'Crear ciclo' }).click();
    await expect(page.getByRole('region', { name: freshName })).toBeVisible();

    // 3) Navegación cliente de vuelta (sin recargar): el selector ya incluye el ciclo nuevo.
    await page.getByRole('link', { name: 'Equipos' }).click();
    await page.getByRole('link', { name: teamName }).click();
    await expect(
      page.getByLabel('Ciclo', { exact: true }).locator('option', { hasText: freshName }),
    ).toHaveCount(1);
  });
});

test.describe('usuario sin permisos de administración', () => {
  test('un integrante no ve ni accede a administración de usuarios y las acciones explican por qué están deshabilitadas', async ({
    page,
  }) => {
    await login(page, memberEmail, memberPassword);

    // Nav: Usuarios deshabilitado y con explicación.
    const usuarios = page
      .getByText('Usuarios', { exact: true })
      .locator('xpath=ancestor::*[@aria-disabled="true"][1]');
    await expect(usuarios).toHaveAttribute(
      'title',
      'Solo administración puede gestionar usuarios.',
    );
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // Acceso directo: notFound(). Con Cache Components el shell ya se envió, así que el status HTTP
    // es 200 pero el contenido es el 404 y nunca se renderiza la lista (la API igual exige ADMIN).
    await page.goto('/admin/usuarios');
    await expect(page.getByText('This page could not be found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toHaveCount(0);
    await expect(page.getByText(memberEmail)).toHaveCount(0);

    // Ciclos: puede ver, no crear.
    await page.goto('/ciclos');
    await expect(page.getByRole('region', { name: annualName })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear ciclo' })).toBeDisabled();
    await expect(page.getByText('Solo administración puede crear ciclos.')).toBeVisible();

    // Equipos: puede ver, no crear.
    await page.goto('/equipos');
    await expect(page.getByRole('link', { name: teamName })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear equipo' })).toBeDisabled();
    await expect(page.getByText('Solo administración puede crear equipos.')).toBeVisible();
  });
});
