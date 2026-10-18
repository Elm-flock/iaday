import generated from './_generated/help.generated.json';

/** Nodos inline del AST generado por `scripts/help/lib.mjs` (sin HTML crudo). */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'br' }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'img'; file: string; alt: string };

export type Block =
  | { t: 'h'; level: number; id: string; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Block[][] }
  | { t: 'quote'; c: Block[] }
  | { t: 'code'; v: string }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

export type Role = 'ADMIN' | 'LEADER' | 'MEMBER';
export type ManualId = 'usuario' | 'admin';

export type HelpSection = {
  id: string;
  manual: ManualId;
  anchor: string;
  title: string;
  level: number;
  parent: string | null;
  plainText: string;
};

export type Manual = {
  id: ManualId;
  title: string;
  audience: string;
  version: string;
  updated: string;
  roles: Role[];
  sections: HelpSection[];
  blocks: Block[];
};

export type HelpData = {
  schemaVersion: number;
  sourceHash: string;
  manuals: Manual[];
  images: Record<string, { width: number; height: number }>;
};

/** Generado por `npm run help:build` (predev/prebuild). Solo lo importa código de servidor. */
export const HELP = generated as unknown as HelpData;

/** Rótulos cortos para tabs/tarjetas (el título completo del manual es largo). */
export const MANUAL_LABEL: Record<ManualId, string> = {
  usuario: 'Manual de usuario',
  admin: 'Manual de administración',
};

export function isManualId(value: string): value is ManualId {
  return HELP.manuals.some((m) => m.id === value);
}

/** Manuales que puede leer un rol: integrante y líder, solo el de usuario; administración, ambos. */
export function manualsForRole(role: Role, data: HelpData = HELP): Manual[] {
  return data.manuals.filter((m) => m.roles.includes(role));
}

export function findManual(id: string, data: HelpData = HELP): Manual | undefined {
  return data.manuals.find((m) => m.id === id);
}

/** Ruta de una sección: `/ayuda/<manual>#<ancla>`. */
export const helpHref = (manual: ManualId, anchor?: string): string =>
  anchor ? `/ayuda/${manual}#${anchor}` : `/ayuda/${manual}`;
