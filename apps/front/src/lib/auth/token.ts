/** Lee `exp` (segundos epoch) de un JWT SIN verificar la firma: solo para decidir si renovar. */
export function jwtExpiry(token: string | undefined): number | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/** true si el token falta, es ilegible o vence dentro de `skewSeconds`. */
export function expiresWithin(
  token: string | undefined,
  skewSeconds: number,
  nowMs = Date.now(),
): boolean {
  const exp = jwtExpiry(token);
  if (exp === null) return true;
  return exp * 1000 - nowMs <= skewSeconds * 1000;
}
