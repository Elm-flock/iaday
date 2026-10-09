/**
 * UNA sola acción primaria por vista. Qué sigue es lo más útil para la persona ahora mismo:
 * 1. Si tiene check-ins vencidos: "Registrar check-in" (lo urgente y de menor esfuerzo).
 * 2. Si no, y no tiene objetivos propios en el ciclo: "Crear objetivo" (sin objetivos no hay nada que seguir).
 * 3. Si no, ninguna: el resto de los enlaces son secundarios.
 */
export type DashboardPrimary = 'register-check-in' | 'create-objective' | null;

export function dashboardPrimary(input: {
  pendingTotal: number;
  individualObjectives: number;
}): DashboardPrimary {
  if (input.pendingTotal > 0) return 'register-check-in';
  if (input.individualObjectives === 0) return 'create-objective';
  return null;
}
