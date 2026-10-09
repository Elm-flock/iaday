import { __setCookies } from './next-headers';
import { cookies } from 'next/headers';
import { describe, expect, it } from 'vitest';

describe('mocks de infraestructura Next', () => {
  it('importar `server-only` no lanza', async () => {
    await expect(import('server-only')).resolves.toBeDefined();
  });

  it('`next/headers` devuelve las cookies sembradas', async () => {
    __setCookies({ okr_at: 'token' });
    const store = await cookies();
    expect(store.get('okr_at')?.value).toBe('token');
  });
});
