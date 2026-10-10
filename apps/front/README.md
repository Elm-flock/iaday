# OKR Platform — Front

Front de la plataforma de OKRs de Flock IT: objetivos y resultados clave (comprometidos y aspiracionales), check-ins con score 0,00–1,00, feedback privado, reconocimientos y reporte PDF por equipo. Consume la API NestJS de `../okr-platform-back` y actúa de BFF: el navegador nunca habla con la API.

## Stack

- Next.js 16.4 (App Router, Turbopack, `cacheComponents`) y React
- TypeScript estricto
- Tailwind CSS 4 + Flock UI propio
- Vitest + React Testing Library (unit) y Playwright (e2e)

## Configuración

Variable de entorno (solo servidor):

| Variable  | Default                 | Descripción        |
| --------- | ----------------------- | ------------------ |
| `API_URL` | `http://localhost:3000` | URL base de la API |

## Cómo correrlo

```bash
npm install
npm run dev         # http://localhost:3000 (si el back usa ese puerto, usar -- -p <puerto>)
npm test            # Vitest (unit y componentes)
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test:e2e:stack  # Playwright contra el back real (requiere Docker y ../okr-platform-back)
```

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Manual de usuario](docs/manual-usuario.md)
- [Sistema de diseño](docs/design-system.md)
- Convenciones del repo: `CLAUDE.md` y `AGENTS.md`
