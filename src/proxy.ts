import { NextResponse, type NextRequest } from 'next/server';
import { createApiClient } from '@/lib/api/create-client';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_SKEW_SECONDS,
  RETRY_COOKIE,
  RETRY_MARKER_MAX_AGE,
  cookieOptions,
  sessionMaxAges,
} from '@/lib/auth/constants';
import { loginUrlPath } from '@/lib/auth/redirect';
import { expiresWithin } from '@/lib/auth/token';

/**
 * Chequeo optimista + refresh silencioso. NO es la autorización: esa es siempre de Nest
 * (el DAL redirige a /login ante un 401) y se re-chequea en cada Server Action/Route Handler.
 */

const PUBLIC_PATHS = ['/login'];
// El catálogo de componentes solo existe en dev.
const DEV_PUBLIC_PATHS = ['/ui'];

function isPublic(pathname: string): boolean {
  const publicPaths =
    process.env.NODE_ENV === 'production' ? PUBLIC_PATHS : [...PUBLIC_PATHS, ...DEV_PUBLIC_PATHS];
  return publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectToLogin(request: NextRequest, clearCookies: boolean): NextResponse {
  const { pathname, search } = request.nextUrl;
  const response = NextResponse.redirect(
    new URL(loginUrlPath(`${pathname}${search}`), request.url),
  );
  if (clearCookies) {
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, RETRY_COOKIE]) response.cookies.delete(name);
  }
  return response;
}

/** Cookie header con los tokens nuevos, para que el render del mismo request vea la sesión renovada. */
function withRotatedCookies(request: NextRequest, access: string, refresh: string): Headers {
  const pairs = new Map<string, string>();
  for (const c of request.cookies.getAll()) pairs.set(c.name, c.value);
  pairs.set(ACCESS_COOKIE, access);
  pairs.set(REFRESH_COOKIE, refresh);
  pairs.delete(RETRY_COOKIE);

  const headers = new Headers(request.headers);
  headers.set(
    'cookie',
    [...pairs].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; '),
  );
  return headers;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessStale = expiresWithin(access, REFRESH_SKEW_SECONDS);
  const accessExpired = expiresWithin(access, 0);

  if (!accessStale) return NextResponse.next();
  if (!refresh) return redirectToLogin(request, true);

  let refreshed: Awaited<ReturnType<ReturnType<typeof createApiClient>['POST']>> | null = null;
  try {
    refreshed = await createApiClient().POST('/auth/refresh', { body: { refreshToken: refresh } });
  } catch {
    // Back caído: no se puede renovar, pero tampoco se borra una sesión que puede seguir viva.
    return accessExpired ? redirectToLogin(request, false) : NextResponse.next();
  }

  if (refreshed.data) {
    const session = refreshed.data;
    const maxAge = sessionMaxAges(session);
    const response = NextResponse.next({
      request: { headers: withRotatedCookies(request, session.accessToken, session.refreshToken) },
    });
    response.cookies.set(ACCESS_COOKIE, session.accessToken, cookieOptions(maxAge.access));
    response.cookies.set(REFRESH_COOKIE, session.refreshToken, cookieOptions(maxAge.refresh));
    response.cookies.delete(RETRY_COOKIE);
    return response;
  }

  // 401: refresh inválido/vencido/reutilizado… o carrera con un request paralelo que ya rotó el
  // token (el back responde 401 sin revocar dentro de la gracia de 10 s).
  if (!accessExpired) return NextResponse.next(); // el access actual todavía sirve.

  if (!request.cookies.has(RETRY_COOKIE)) {
    // Primer fallo: el request ganador pudo haber seteado cookies nuevas. Reintentamos una vez
    // con una marca efímera, sin borrar nada (borrar pisaría las cookies nuevas del ganador).
    const retry = NextResponse.redirect(request.nextUrl);
    retry.cookies.set(RETRY_COOKIE, '1', cookieOptions(RETRY_MARKER_MAX_AGE));
    return retry;
  }

  return redirectToLogin(request, true);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)',
  ],
};
