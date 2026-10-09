import type { components } from '@/lib/api/schema';

type TeamNode = components['schemas']['TeamNodeDto'];

export type FlatTeam = { id: string; name: string; parentId: string | null; depth: number };

/** Aplana el árbol en orden de lectura, con la profundidad para indentar. */
export function flattenTeams(nodes: TeamNode[], depth = 0): FlatTeam[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, parentId: n.parentId, depth },
    ...flattenTeams(n.children, depth + 1),
  ]);
}

/** Ids de `id` y todos sus descendientes (un equipo no puede mudarse debajo de sí mismo). */
export function selfAndDescendantIds(nodes: TeamNode[], id: string): Set<string> {
  const result = new Set<string>();
  const collect = (node: TeamNode) => {
    result.add(node.id);
    node.children.forEach(collect);
  };
  const find = (list: TeamNode[]): TeamNode | undefined => {
    for (const n of list) {
      if (n.id === id) return n;
      const found = find(n.children);
      if (found) return found;
    }
    return undefined;
  };
  const start = find(nodes);
  if (start) collect(start);
  return result;
}

/** Mezcla de origen en porcentaje para mostrar. `null` si no hay objetivos que mezclar. */
export function originMixShares(mix: { topDown: number; bottomUp: number }) {
  const total = mix.topDown + mix.bottomUp;
  if (total === 0) return null;
  return { total, topDown: mix.topDown / total, bottomUp: mix.bottomUp / total };
}
