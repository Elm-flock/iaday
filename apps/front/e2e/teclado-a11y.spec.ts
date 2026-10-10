import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  PASSWORD,
  SHOTS,
  createUser,
  loginAdminApi,
  seedActiveCycles,
  seedPublishedObjectives,
  sessionFor,
  uniqueSuffix,
  uniqueYear,
  api,
} from './helpers';

/**
 * Accesibilidad de interacción: recorridos solo con teclado (login, drawer de check-in, ConfirmDialog,
 * formulario de feedback), axe sobre los diálogos ABIERTOS (claro y oscuro) y las correcciones de
 * pulido (tooltip "Cerrar", tabla de KRs responsive, "Ver el muro" en una línea).
 */
const suffix = uniqueSuffix();
const people = {
  ana: { name: `Ana Teclado ${suffix}`, email: `ana.teclado.${suffix}@e2e.test` },
  beto: { name: `Beto Teclado ${suffix}`, email: `beto.teclado.${suffix}@e2e.test` },
};
const ctx = { cycleId: '', objectiveId: '', draftId: '', krTitle: '' };

/** Nombre accesible o texto del elemento enfocado. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    const labelled = el.getAttribute('aria-label');
    const labels = (el as HTMLInputElement).labels;
    return (labelled ?? labels?.[0]?.textContent ?? el.textContent ?? el.tagName).trim();
  });

/**
 * El foco nunca cae en contenido de la página detrás del diálogo (inerte). Con <dialog>.showModal() el
 * Tab desde el último elemento sale a la UI del navegador (activeElement = body): es el comportamiento
 * nativo y no un escape a la página.
 */
const insideDialog = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return !el || el === document.body || !!el.closest('dialog[open]');
  });

async function axeOnOpenDialog(page: Page, theme: 'claro' | 'oscuro') {
  await page.evaluate(
    (dark) => document.documentElement.classList.toggle('dark', dark),
    theme === 'oscuro',
  );
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    violations.map(
      (v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
    `diálogo abierto (${theme})`,
  ).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('teclado y diálogos accesibles', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginAdminApi(request);
    const { quarterId } = await seedActiveCycles(request, admin.token, uniqueYear(), suffix);
    ctx.cycleId = quarterId;
    const ana = await createUser(request, admin.token, people.ana);
    const beto = await createUser(request, admin.token, people.beto);
    const published = await seedPublishedObjectives(request, ana.token, {
      cycleId: quarterId,
      owner: { ownerUserId: ana.id },
      krOwnerId: ana.id,
      label: `Objetivo Teclado ${suffix}`,
    });
    ctx.objectiveId = published[0].id;
    ctx.krTitle = published[0].krs[0].title;
    // Un borrador para el ConfirmDialog de publicar (la publicación misma no se ejecuta).
    const draft = await api<{ id: string }>(request, 'post', '/objectives', ana.token, {
      cycleId: quarterId,
      ownerUserId: ana.id,
      title: `Borrador Teclado ${suffix}`,
      type: 'ASPIRATIONAL',
      origin: 'TOP_DOWN',
    });
    ctx.draftId = draft.id;
    await api(request, 'post', '/recognitions', beto.token, {
      toUserId: ana.id,
      message: `Gran trabajo en el cierre del trimestre ${suffix}`,
    });
    await request.dispose();
  });

  test('login solo con teclado: orden de foco Email, Contraseña, Ingresar y Enter envía', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      order.push(await focusedName(page));
      if (i === 0) await page.keyboard.type(people.ana.email);
      if (i === 1) await page.keyboard.type(PASSWORD);
    }
    expect(order[0]).toMatch(/Email/);
    expect(order[1]).toMatch(/Contraseña/);
    expect(order[2]).toMatch(/Ingresar/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  });

  test('drawer de check-in: abre con Enter, foco adentro y atrapado, Esc cierra y devuelve el foco', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    const trigger = page.getByRole('button', { name: `Registrar check-in de ${ctx.krTitle}` });
    await expect(trigger).toBeVisible();
    await page.waitForLoadState('networkidle');
    await trigger.focus();
    await page.keyboard.press('Enter');

    const drawer = page.getByRole('dialog', { name: 'Registrar check-in' });
    await expect(drawer).toBeVisible();
    expect(await insideDialog(page)).toBe(true);
    // El foco inicial NO es el botón "Cerrar" y su tooltip no queda flotando.
    expect(await focusedName(page)).not.toBe('Cerrar');
    await expect(drawer.getByText('Cerrar', { exact: true })).toHaveCSS('opacity', '0');

    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await insideDialog(page), `Tab #${i + 1} escapó del diálogo`).toBe(true);
    }
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await insideDialog(page), `Shift+Tab #${i + 1} escapó del diálogo`).toBe(true);
    }

    await axeOnOpenDialog(page, 'claro');
    await axeOnOpenDialog(page, 'oscuro');

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.context().close();
  });

  test('tooltip "Cerrar": no flota al abrir con el mouse, y al pasar el mouse queda dentro del panel', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: `Registrar check-in de ${ctx.krTitle}` }).click();
    const drawer = page.getByRole('dialog', { name: 'Registrar check-in' });
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(300);
    const tooltip = drawer.getByText('Cerrar', { exact: true });
    await expect(tooltip).toHaveCSS('opacity', '0');
    await page.screenshot({ path: `${SHOTS}/check-in-drawer.png` });

    await drawer.getByRole('button', { name: 'Cerrar' }).hover();
    await expect(tooltip).toHaveCSS('opacity', '1');
    const [tip, panel] = await Promise.all([tooltip.boundingBox(), drawer.boundingBox()]);
    expect(tip!.x + tip!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
    await page.context().close();
  });

  test('ConfirmDialog (publicar): foco en Cancelar, atrapado, Esc cierra y devuelve el foco', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto(`/objetivos/${ctx.draftId}`);
    await page.waitForLoadState('networkidle');
    const trigger = page.getByRole('button', { name: 'Publicar', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await insideDialog(page), `Tab #${i + 1} escapó del diálogo`).toBe(true);
    }
    await axeOnOpenDialog(page, 'claro');
    await axeOnOpenDialog(page, 'oscuro');
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.context().close();
  });

  test('formulario de feedback solo con teclado: orden lógico y envío con Enter', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.goto('/feedback/nuevo');
    await page.waitForLoadState('networkidle');
    await page.getByLabel(/Para quién/).focus();
    // Elegir con teclado: tipear el nombre posiciona el <select>.
    await page.keyboard.type(people.beto.name.slice(0, 8));
    await expect(page.getByLabel(/Para quién/)).toHaveValue(/.+/);
    const order: string[] = [await focusedName(page)];
    await page.keyboard.press('Tab');
    order.push(await focusedName(page));
    await page.keyboard.type(`Muy buena la forma de priorizar ${suffix}`);
    await page.keyboard.press('Tab');
    order.push(await focusedName(page));
    expect(order[0]).toMatch(/Para quién/);
    expect(order[1]).toMatch(/Mensaje/);
    expect(order[2]).toMatch(/relacionado/);
    await page.keyboard.press('Tab');
    expect(await focusedName(page)).toMatch(/Enviar feedback|Cancelar/);
    // Hasta el botón primario y Enter.
    while (!(await focusedName(page)).includes('Enviar feedback')) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/feedback\?box=sent/);
    await page.context().close();
  });

  test('tabla de KRs: apilada y sin scroll horizontal en pantallas angostas, tabla completa en anchas', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    await expect(page.getByRole('heading', { name: /Resultados clave \(3 de 5\)/ })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - window.innerWidth,
      table: (() => {
        const container = document.querySelector('table')!.parentElement!;
        return container.scrollWidth - container.clientWidth;
      })(),
    }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.table).toBeLessThanOrEqual(0);
    // No se pierden datos: cada fila conserva sus etiquetas y valores.
    const row = page.getByRole('row', { name: new RegExp(ctx.krTitle) });
    for (const label of ['Tipo', 'Inicio', 'Meta', 'Actual', 'Unidad', 'Score', 'Banda']) {
      await expect(row.locator(`[data-label="${label}"]`)).toBeVisible();
    }
    await expect(row.locator('[data-label="Meta"]')).toContainText('100');
    await page.screenshot({ path: `${SHOTS}/objetivo-detalle-angosto.png`, fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('columnheader', { name: 'Meta' })).toBeVisible();
    await page.context().close();
  });

  test('"Ver el muro" queda en una sola línea en el card de reconocimientos', async ({
    browser,
  }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    for (const width of [1280, 1024, 800]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const link = page.getByRole('link', { name: 'Ver el muro' }).filter({ visible: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box!.height, `alto del enlace a ${width}px`).toBeLessThan(26);
    }
    await page.context().close();
  });

  test('capturas en tema oscuro: inicio y detalle de objetivo', async ({ browser }) => {
    const page = await sessionFor(browser, people.ana.email, PASSWORD);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/inicio-oscuro.png`, fullPage: true });
    await page.goto(`/objetivos/${ctx.objectiveId}`);
    await expect(page.getByRole('heading', { name: /Resultados clave/ })).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/objetivo-detalle-oscuro.png`, fullPage: true });
    await page.context().close();
  });
});
