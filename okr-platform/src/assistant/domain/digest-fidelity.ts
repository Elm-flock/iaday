import {
  activeFactKeys,
  ENDING_SOON_DAYS,
  factCount,
  SENSITIVE_WINDOW_HOURS,
  type DigestFacts,
  type FactKey,
} from './digest-facts';

export interface DigestItem {
  factKey: FactKey;
  text: string;
}
export interface DigestSummary {
  headline: string;
  items: DigestItem[];
}

export const HEADLINE_MAX = 200;
export const ITEM_TEXT_MAX = 300;
export const ITEMS_MAX = 8;

/** Todas las secuencias de dígitos de un texto ("2026-12-31" -> 2026, 12, 31). */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d+/g) ?? []).map((n) => String(Number(n)));
}

function collectNumbers(value: unknown, into: Set<string>): void {
  if (typeof value === 'number') {
    for (const n of extractNumbers(String(Math.abs(value)))) into.add(n);
  } else if (typeof value === 'string') {
    for (const n of extractNumbers(value)) into.add(n);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectNumbers(v, into));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectNumbers(v, into));
  }
}

/**
 * Números que un resumen puede mencionar: los de los hechos (conteos, días, fechas, nombres con
 * dígitos) y la cantidad de temas ("Hay 3 temas para revisar").
 */
export function allowedNumbers(facts: DigestFacts): Set<string> {
  const set = new Set<string>();
  collectNumbers(facts, set);
  set.add(String(activeFactKeys(facts).length));
  // Ventanas fijas que las novedades mencionan ("en 14 días", "últimas 72 horas").
  set.add(String(ENDING_SOON_DAYS));
  set.add(String(SENSITIVE_WINDOW_HOURS));
  return set;
}

export interface FidelityResult {
  faithful: boolean;
  unknownNumbers: string[];
}

/** Fidelidad: ningún número del texto puede faltar en los hechos. */
export function checkFidelity(texts: string[], facts: DigestFacts): FidelityResult {
  const allowed = allowedNumbers(facts);
  const unknown = new Set<string>();
  for (const text of texts) {
    for (const n of extractNumbers(text)) if (!allowed.has(n)) unknown.add(n);
  }
  return { faithful: unknown.size === 0, unknownNumbers: [...unknown] };
}

/** Parseo estructural del resumen del agente (null si no cumple el contrato). */
export function parseSummary(raw: unknown): DigestSummary | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { headline?: unknown; items?: unknown };
  if (typeof r.headline !== 'string' || !Array.isArray(r.items)) return null;
  const items: DigestItem[] = [];
  for (const it of r.items) {
    if (
      typeof it !== 'object' ||
      it === null ||
      typeof (it as DigestItem).factKey !== 'string' ||
      typeof (it as DigestItem).text !== 'string'
    ) {
      return null;
    }
    items.push({ factKey: (it as DigestItem).factKey, text: (it as DigestItem).text });
  }
  return { headline: r.headline, items };
}

/**
 * ¿Se puede mostrar el resumen del agente? Exige claves válidas con novedades (sin repetir),
 * límites de largo y fidelidad numérica.
 */
export function isSummaryAcceptable(summary: DigestSummary, facts: DigestFacts): boolean {
  if (summary.headline.length === 0 || summary.headline.length > HEADLINE_MAX) return false;
  if (summary.items.length > ITEMS_MAX) return false;
  const active = new Set<string>(activeFactKeys(facts));
  const seen = new Set<string>();
  for (const it of summary.items) {
    if (!active.has(it.factKey) || seen.has(it.factKey)) return false;
    if (it.text.length === 0 || it.text.length > ITEM_TEXT_MAX) return false;
    seen.add(it.factKey);
  }
  return checkFidelity([summary.headline, ...summary.items.map((i) => i.text)], facts).faithful;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const days = (n: number): string => plural(n, 'día', 'días');

/** Texto determinista de una novedad (es-AR). */
export function templateItemText(key: FactKey, facts: DigestFacts): string {
  switch (key) {
    case 'cyclesToClose': {
      const f = facts.cyclesToClose;
      const e = f.examples[0];
      return f.count === 1
        ? `El ciclo ${e.cycleName} terminó hace ${days(e.daysPast)} y sigue activo: falta cerrarlo.`
        : `${f.count} ciclos ya terminaron y siguen activos: falta cerrarlos. El más atrasado es ${e.cycleName}.`;
    }
    case 'adaptationRequestsOpen': {
      const f = facts.adaptationRequestsOpen;
      const parts = [
        `${plural(f.count, 'pedido de documento adaptado abierto', 'pedidos de documento adaptado abiertos')}`,
      ];
      if (f.overdueCount > 0) parts.push(`${f.overdueCount} fuera de plazo`);
      if (f.unassignedCount > 0) parts.push(`${f.unassignedCount} sin asignar`);
      return `Hay ${parts.join(', ')}.`;
    }
    case 'overdueCheckIns': {
      const f = facts.overdueCheckIns;
      const e = f.examples[0];
      return f.count === 1
        ? `1 resultado clave tiene el check-in vencido: «${e.krTitle}», de ${e.ownerName}, con ${days(e.daysOverdue)} de atraso.`
        : `${f.count} resultados clave tienen el check-in vencido. El más atrasado es «${e.krTitle}», de ${e.ownerName}, con ${days(e.daysOverdue)}.`;
    }
    case 'krsInRed': {
      const f = facts.krsInRed;
      return f.count === 1
        ? `1 resultado clave está en rojo: «${f.examples[0].krTitle}».`
        : `${f.count} resultados clave están en rojo. Uno es «${f.examples[0].krTitle}».`;
    }
    case 'cyclesEndingSoon': {
      const f = facts.cyclesEndingSoon;
      const e = f.examples[0];
      return f.count === 1
        ? `El ciclo ${e.cycleName} termina en ${days(e.daysLeft)}.`
        : `${f.count} ciclos terminan en los próximos ${days(14)}. El primero es ${e.cycleName}, en ${days(e.daysLeft)}.`;
    }
    case 'draftsNotPublishable': {
      const f = facts.draftsNotPublishable;
      return f.count === 1
        ? `1 objetivo en borrador todavía no se puede publicar: «${f.examples[0].objectiveTitle}».`
        : `${f.count} objetivos en borrador todavía no se pueden publicar.`;
    }
    case 'usersWithoutTeam': {
      const f = facts.usersWithoutTeam;
      return f.count === 1
        ? `1 persona activa no está en ningún equipo: ${f.examples[0].userName}.`
        : `${f.count} personas activas no están en ningún equipo.`;
    }
    case 'teamsWithoutLead': {
      const f = facts.teamsWithoutLead;
      return f.count === 1
        ? `1 equipo no tiene líder: ${f.examples[0].teamName}.`
        : `${f.count} equipos no tienen líder.`;
    }
    case 'adaptationsNeedingReview': {
      const n = facts.adaptationsNeedingReview.count;
      return n === 1
        ? '1 versión adaptada con IA requiere revisión humana.'
        : `${n} versiones adaptadas con IA requieren revisión humana.`;
    }
    case 'recentSensitiveChanges': {
      const n = facts.recentSensitiveChanges.count;
      return n === 1
        ? '1 cambio sensible en las últimas 72 horas (rol, baja de usuario, meta o umbrales).'
        : `${n} cambios sensibles en las últimas 72 horas (rol, baja de usuario, meta o umbrales).`;
    }
  }
}

/** Resumen de plantilla: se usa si el agente falla, no es fiel o no hay nada que redactar. */
export function templateSummary(facts: DigestFacts): DigestSummary {
  const keys = activeFactKeys(facts);
  if (keys.length === 0) return { headline: 'No hay nada urgente hoy.', items: [] };
  return {
    headline:
      keys.length === 1
        ? 'Hay 1 tema para revisar hoy.'
        : `Hay ${keys.length} temas para revisar hoy.`,
    items: keys.slice(0, ITEMS_MAX).map((factKey) => ({
      factKey,
      text: templateItemText(factKey, facts),
    })),
  };
}

/** Cantidad total de novedades (suma de conteos); útil para decidir si se llama al agente. */
export const totalFacts = (facts: DigestFacts): number =>
  activeFactKeys(facts).reduce((acc, k) => acc + factCount(facts, k), 0);
