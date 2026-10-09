import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const mock = (file: string) => fileURLToPath(new URL(`./test/mocks/${file}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` lanza error fuera de un Server Component; en tests es un no-op.
      'server-only': mock('server-only.ts'),
      // `next/headers` solo existe en el runtime de Next; se reemplaza por un stub controlable.
      'next/headers': mock('next-headers.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'e2e/**', '.next/**'],
  },
});
