import { err, ok, type Result } from '../../common/domain/result';
import type { ActionType } from './plan-schema';
import type { ResolvedAction, ResolvedRef } from './plan-validate';

/**
 * Llamada concreta a un servicio: `dto` es el payload que se valida con la clase DTO de Nest
 * (null si la acción no tiene DTO) e `ids` los identificadores que van como parámetros sueltos.
 */
export interface ActionCall {
  dtoName:
    | 'CreateUserDto'
    | 'CreateTeamDto'
    | 'SetMemberDto'
    | 'CreateCycleDto'
    | 'CreateObjectiveDto'
    | 'CreateKeyResultDto'
    | 'UpdateKeyResultDto'
    | null;
  dto: Record<string, unknown> | null;
  ids: Record<string, string>;
}

/** Quita las claves con valor undefined/null para que `forbidNonWhitelisted` solo vea lo informado. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

const pick = (p: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  compact(Object.fromEntries(keys.map((k) => [k, p[k]])));

/**
 * Arma la llamada de una acción resuelta (mapeo §4.3 del contrato). `resolve` devuelve el UUID de una
 * referencia (las NEW salen del mapa de lo creado antes en la ejecución) o null si no existe todavía.
 * Nunca incluye contraseñas: la clave inicial la genera Nest al ejecutar CREATE_USER.
 */
export function buildActionCall(
  action: ResolvedAction,
  resolve: (ref: ResolvedRef) => string | null,
): Result<ActionCall> {
  const ids: Record<string, string> = {};
  for (const [field, ref] of Object.entries(action.refs)) {
    const id = resolve(ref);
    if (!id) return err('UNKNOWN_REF', `No se encontró lo que se creaba antes ("${ref.label}").`);
    ids[field] = id;
  }
  const p = action.params;
  const type = action.type as ActionType;
  switch (type) {
    case 'CREATE_USER':
      return ok({ dtoName: 'CreateUserDto', dto: pick(p, ['name', 'email', 'role']), ids });
    case 'CREATE_TEAM':
      return ok({
        dtoName: 'CreateTeamDto',
        dto: compact({ name: p.name, parentId: ids.parent }),
        ids,
      });
    case 'SET_TEAM_MEMBER':
      return ok({ dtoName: 'SetMemberDto', dto: pick(p, ['isLead']), ids });
    case 'REMOVE_TEAM_MEMBER':
      return ok({ dtoName: null, dto: null, ids });
    case 'CREATE_CYCLE':
      return ok({
        dtoName: 'CreateCycleDto',
        dto: compact({
          ...pick(p, [
            'name',
            'kind',
            'startDate',
            'endDate',
            'checkInCadence',
            'committedThreshold',
            'aspirationalThreshold',
          ]),
          parentId: ids.parent,
        }),
        ids,
      });
    case 'ACTIVATE_CYCLE':
      return ok({ dtoName: null, dto: null, ids });
    case 'CREATE_OBJECTIVE':
      return ok({
        dtoName: 'CreateObjectiveDto',
        dto: compact({
          ...pick(p, ['title', 'description', 'origin']),
          type: p.objectiveType,
          cycleId: ids.cycle,
          ownerUserId: ids.ownerUser,
          ownerTeamId: ids.ownerTeam,
          parentObjectiveId: ids.parentObjective,
        }),
        ids,
      });
    case 'CREATE_KEY_RESULT':
      return ok({
        dtoName: 'CreateKeyResultDto',
        dto: compact({
          ...pick(p, ['title', 'scoring', 'unit', 'startValue', 'targetValue']),
          ownerId: ids.owner,
        }),
        ids,
      });
    case 'SET_KEY_RESULT_OWNER':
      return ok({ dtoName: 'UpdateKeyResultDto', dto: { ownerId: ids.owner }, ids });
    default:
      return err('UNKNOWN_ACTION', `La acción ${String(action.type)} no está permitida.`);
  }
}
