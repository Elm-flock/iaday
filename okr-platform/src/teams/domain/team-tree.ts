import { err, ok, type Result } from '../../common/domain/result';

/** Mapa teamId -> parentId (null si es raíz). */
export type ParentMap = ReadonlyMap<string, string | null>;

/**
 * Valida que mover `teamId` bajo `newParentId` no rompa el árbol: ni auto-padre ni ciclo
 * (el nuevo padre no puede ser descendiente del equipo que se mueve).
 * Se sube por los ancestros del nuevo padre; si aparece `teamId`, hay ciclo.
 */
export function validateTeamMove(
  teamId: string,
  newParentId: string,
  parentOf: ParentMap,
): Result<void> {
  if (teamId === newParentId)
    return err('TEAM_SELF_PARENT', 'Un equipo no puede ser su propio padre');

  const visited = new Set<string>();
  let current: string | null | undefined = newParentId;
  while (current && !visited.has(current)) {
    if (current === teamId)
      return err('TEAM_CYCLE', 'El movimiento crearía un ciclo en el árbol de equipos');
    visited.add(current);
    current = parentOf.get(current);
  }
  return ok();
}
