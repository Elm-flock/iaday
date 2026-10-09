/** Cookies de sesión. Solo las escriben loginAction/logoutAction y src/proxy.ts. */
export const ACCESS_COOKIE = 'okr_at';
export const REFRESH_COOKIE = 'okr_rt';
/** Marca efímera: este request ya reintentó tras perder una carrera de refresh. */
export const RETRY_COOKIE = 'okr_rr';

/** Si el access vence en menos de esto, el proxy lo renueva. */
export const REFRESH_SKEW_SECONDS = 60;
export const RETRY_MARKER_MAX_AGE = 10;

const FALLBACK_ACCESS_MAX_AGE = 15 * 60;
const FALLBACK_REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

export type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

export function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

type SessionLike = { accessExpiresAt: string; refreshExpiresAt: string };

function secondsUntil(iso: string, fallback: number, now: number): number {
  const ms = Date.parse(iso) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : fallback;
}

/** maxAge de cada cookie derivado de los vencimientos que informa el back. */
export function sessionMaxAges(session: SessionLike, now = Date.now()) {
  return {
    access: secondsUntil(session.accessExpiresAt, FALLBACK_ACCESS_MAX_AGE, now),
    refresh: secondsUntil(session.refreshExpiresAt, FALLBACK_REFRESH_MAX_AGE, now),
  };
}
