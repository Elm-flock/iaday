import { formatNumber, formatPercent } from '@/lib/format';

export const FEATURE_LABEL: Record<string, string> = {
  ADAPT: 'Versión accesible',
  OKR_SUGGEST: 'Sugerencia de redacción',
  CHECKIN_SUMMARY: 'Resumen de check-ins',
};

export const STEP_LABEL: Record<string, string> = {
  CLASSIFY: 'Clasificación',
  GENERATE: 'Generación',
  REPAIR: 'Reparación',
  JUDGE: 'Verificación (juez)',
  REGENERATE: 'Regeneración',
  TRANSPORT: 'Conexión con el agente',
};

export const ERROR_CODE_LABEL: Record<string, string> = {
  TIMEOUT: 'Tiempo agotado',
  UPSTREAM_ERROR: 'Error del proveedor',
  UPSTREAM_RATE_LIMITED: 'Límite del proveedor',
  INVALID_JSON: 'Respuesta no válida',
  SCHEMA_MISMATCH: 'Formato inesperado',
  AGENT_UNREACHABLE: 'Agente inalcanzable',
  AGENT_TIMEOUT: 'El agente no respondió a tiempo',
  AGENT_BAD_RESPONSE: 'Respuesta ilegible del agente',
};

export const COST_NOTE =
  'El costo es una ESTIMACIÓN según una tabla de precios de referencia: el plan gratuito del proveedor no factura.';

export const NO_DATA = 'Sin datos';

/** Costo en USD (estimado), con 4 decimales porque cada pedido cuesta fracciones de centavo. */
export const formatCostUsd = (value: number): string => `US$ ${formatNumber(value, 4)}`;

export const formatMs = (value: number | null): string =>
  value === null ? NO_DATA : `${formatNumber(value, 0)} ms`;

export const formatRatio = (value: number | null): string =>
  value === null ? NO_DATA : formatPercent(value, 1);

export const labelOf = (map: Record<string, string>, key: string): string => map[key] ?? key;
