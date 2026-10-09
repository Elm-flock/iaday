// Stub de `next/headers` para tests unitarios.
// Uso: import relativo de `test/mocks/next-headers` y sembrar cookies por test.
type CookieValue = { name: string; value: string };

const store = new Map<string, string>();
const headerStore = new Map<string, string>();

export function __setCookies(cookies: Record<string, string>) {
  store.clear();
  for (const [k, v] of Object.entries(cookies)) store.set(k, v);
}

export function __setHeaders(headers: Record<string, string>) {
  headerStore.clear();
  for (const [k, v] of Object.entries(headers)) headerStore.set(k.toLowerCase(), v);
}

export function __resetNextHeaders() {
  store.clear();
  headerStore.clear();
}

export async function cookies() {
  return {
    get: (name: string): CookieValue | undefined =>
      store.has(name) ? { name, value: store.get(name)! } : undefined,
    getAll: (): CookieValue[] => [...store].map(([name, value]) => ({ name, value })),
    has: (name: string) => store.has(name),
    set: (name: string, value: string) => void store.set(name, value),
    delete: (name: string) => void store.delete(name),
  };
}

export async function headers() {
  return new Headers([...headerStore]);
}
