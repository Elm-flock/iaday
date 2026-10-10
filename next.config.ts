import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PDF del equipo: los .woff de Public Sans se leen con fs en runtime; hay que incluirlos en el trace.
  // (@react-pdf/renderer ya está en la lista de externos por defecto de Next: no hace falta serverExternalPackages.)
  outputFileTracingIncludes: {
    '/api/reports/teams/*/pdf': ['./src/lib/pdf/fonts/**/*'],
  },
  turbopack: {
    rules: {
      '*.css': {
        // Sin esto el loader también procesa el CSS interno de next/font/google y, con .next vacío, el dev
        // server no compila (500: Can't resolve '@vercel/turbopack-next/internal/font/google/font').
        condition: { not: 'foreign' },
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
