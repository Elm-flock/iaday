/** Pantalla de la app (ruta relativa) de una entidad creada o afectada; null si no tiene una propia. */
export function entityUrl(
  entityType: string,
  id: string,
  extra: { objectiveId?: string | null } = {},
): string | null {
  switch (entityType) {
    case 'User':
      return '/admin/usuarios';
    case 'Team':
      return `/equipos/${id}`;
    case 'Cycle':
      return `/ciclos/${id}`;
    case 'Objective':
      return `/objetivos/${id}`;
    case 'KeyResult':
      return extra.objectiveId ? `/objetivos/${extra.objectiveId}` : null;
    default:
      return null;
  }
}
