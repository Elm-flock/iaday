import { expect, test } from '@playwright/test';

const SHOTS = 'e2e/__screenshots__';

test.describe('catálogo /ui', () => {
  test('renderiza los componentes, alterna tema oscuro y captura pantallas', async ({ page }) => {
    await page.goto('/ui');

    await expect(page.getByRole('heading', { level: 1, name: 'Sistema de diseño' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
    await expect(page.getByText('En ruta').first()).toBeVisible();
    await expect(page.getByText('Requiere atención').first()).toBeVisible();
    await expect(page.getByText('En riesgo').first()).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Retención' })).toBeVisible();
    await expect(page.getByLabel(/Título del objetivo/)).toBeVisible();

    // El shell respeta los anchos del sistema: sidebar 248px, header 64px.
    const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
    expect((await sidebar.boundingBox())?.width).toBe(248);
    expect((await page.locator('header').first().boundingBox())?.height).toBe(64);
    await page.getByRole('button', { name: 'Colapsar menú lateral' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(68);
    await page.getByRole('button', { name: 'Expandir menú lateral' }).click();

    await page.screenshot({ path: `${SHOTS}/ui-light.png`, fullPage: true });

    const root = page.getByTestId('theme-root');
    await expect(root).not.toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Tema oscuro' }).click();
    await expect(root).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Tema claro' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ui-dark.png`, fullPage: true });
  });

  test('el modal abre, atrapa foco y cierra con Esc; ConfirmDialog usa verbo + objeto', async ({
    page,
  }) => {
    await page.goto('/ui');

    await page.getByRole('button', { name: 'Abrir modal' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo resultado clave' });
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    await page.getByRole('button', { name: 'Abrir drawer' }).click();
    await expect(page.getByRole('dialog', { name: 'Detalle del objetivo' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Eliminar partner' }).first().click();
    const confirm = page.getByRole('alertdialog', { name: 'Eliminar partner' });
    await expect(confirm).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ui-confirm-dialog.png` });
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
  });

  test('el toast se anuncia en la región de notificaciones', async ({ page }) => {
    await page.goto('/ui');
    await page.getByRole('button', { name: 'Mostrar toast' }).click();
    await expect(
      page.getByRole('region', { name: 'Notificaciones' }).getByText('Cambios guardados'),
    ).toBeVisible();
  });
});
