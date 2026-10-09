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
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
