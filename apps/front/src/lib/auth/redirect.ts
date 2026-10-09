const BASE = 'http://okr.invalid';

/**
 * Valida el parámetro `next` de /login: solo rutas relativas al mismo origen.
 * Cualquier otra cosa (URL absoluta, `//host`, `/\host`, controles) cae a `fallback`.
 */
export function safeNext(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login?next=<ruta>`; sin `next` si la ruta es la home. */
export function loginUrlPath(next: string): string {
  const safe = safeNext(next);
  return safe === '/' ? '/login' : `/login?next=${encodeURIComponent(safe)}`;
}
