import type { ManualId } from './help-data';

/** Textos de la ayuda (es-AR, lenguaje claro). Los manuales tienen su propio texto en `docs/manuales`. */
export const HELP_TITLE = 'Ayuda';
export const HELP_INTRO =
  'Acá están los manuales de OKR Platform. Elegí uno, buscá una palabra o entrá directo a una tarea.';
export const SEARCH_LABEL = 'Buscar en la ayuda';
export const SEARCH_PLACEHOLDER = 'Por ejemplo: check-in, contraseña, ciclo';
export const SEARCH_BUTTON = 'Buscar';
export const SEARCH_CLEAR = 'Quitar la búsqueda';
export const searchSummary = (n: number, q: string) =>
  n === 0
    ? `No encontramos nada para «${q}».`
    : `${n === 1 ? 'Encontramos 1 resultado' : `Encontramos ${n} resultados`} para «${q}».`;
export const SEARCH_EMPTY_HINT =
  'Probá con otra palabra o más corta. Los manuales siguen acá abajo.';
export const MANUALS_HEADING = 'Manuales';
export const OPEN_MANUAL = 'Abrir el manual';
export const MANUAL_DESCRIPTION: Record<ManualId, string> = {
  usuario:
    'Para integrantes y líderes de equipo: objetivos, check-ins, feedback y documentos adaptados.',
  admin:
    'Para administración: usuarios, equipos, ciclos, auditoría, uso de IA y pedidos de adaptación.',
};
export const TOC_LABEL = 'Contenido del manual';
export const MANUALS_NAV_LABEL = 'Manuales';
export const SKIP_TO_CONTENT = 'Saltar al contenido del manual';
export const SKIP_TO_TOC = 'Ir al índice';
export const PRINT = 'Imprimir';
export const COPY_LINK = 'Copiar enlace';
export const copyLinkLabel = (title: string) => `Copiar enlace a «${title}»`;
export const LINK_COPIED = 'Enlace copiado.';
export const LINK_COPY_FAILED =
  'No pudimos copiar el enlace. Copialo desde la barra del navegador.';
export const BACK_TO_HELP = 'Volver a la ayuda';
export const versionLine = (version: string, updated: string) =>
  `Versión ${version} · actualizado el ${updated.split('-').reverse().join('/')}`;
