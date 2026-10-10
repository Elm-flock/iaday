import { chromium, type FullConfig } from '@playwright/test';
import { ADMIN } from './helpers';

/**
 * Calienta `next dev` antes de los tests. Dev compila cada ruta bajo demanda: con .next vacío, varios
 * workers pidiendo a la vez el login, `/` y los módulos saturan la compilación y un login tarda más
 * que el timeout de `expect` (síntoma: botón "Ingresar" deshabilitado y la URL se queda en /login).
 * Recorrer las rutas una vez, en serie y con un admin, deja la compilación fuera de los tests.
 * Si el back no está levantado no falla: los tests reportan el problema real.
 */
const ROUTES = [
  '/',
  '/objetivos',
  '/objetivos/nuevo',
  '/check-ins',
  '/equipos',
  '/ciclos',
  '/feedback',
  '/feedback/nuevo',
  '/reconocimientos',
  '/reconocimientos/nuevo',
  '/admin/usuarios',
  '/ui',
  '/ruta-que-no-existe',
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto('/login', { timeout: 120_000 });
    await page.getByLabel(/Email/).fill(ADMIN.email);
    await page.getByLabel(/Contraseña/).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL(baseURL + '/', { timeout: 120_000 });
    for (const route of ROUTES) {
      await page.goto(route, { timeout: 120_000 });
    }
  } catch (error) {
    console.warn(`[global-setup] No se pudo calentar next dev: ${(error as Error).message}`);
  } finally {
    await browser.close();
  }
}
