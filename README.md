# OKR Platform — Front

Front de la plataforma de OKRs de Flock IT: objetivos y resultados clave (comprometidos y aspiracionales), check-ins con score 0,00–1,00, feedback privado, reconocimientos y reporte PDF por equipo. Consume la API NestJS de `../okr-platform-back` y actúa de BFF: el navegador nunca habla con la API.

Además incluye:

- **Ayudas de IA**: versión en lectura fácil y lenguaje claro, sugerir redacción, resumir check-ins y el tablero "Uso de IA" (`admin/uso-ia`).
- **Asistente de administración** (`admin/asistente`): novedades, chat y planes que se confirman antes de ejecutarse.
- **Ayuda** (`/ayuda`): los manuales, generados en build desde Markdown y filtrados por rol.
- **Pedidos de documentos adaptados** (art. 14.5 del RD 707/2026) y **auditoría** (`admin/auditoria`).
- **Cambio de contraseña** obligatorio en el primer ingreso y voluntario desde el menú.

Si la API tiene la IA apagada o el agente no responde, estas ayudas se ocultan o muestran un aviso, y el resto de la app sigue funcionando.

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
npm run test:e2e:stack  # Playwright contra el back real (requiere Docker y ../okr-platform-back) y stubs del agente
npm run help:build      # regenera la sección Ayuda tras editar los manuales (también corre en predev/prebuild)
```

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Manual de uso](docs/manuales/manual-usuario.md) y [manual de administración](docs/manuales/manual-admin.md), en lenguaje claro; [cómo se mantienen](docs/manuales/README.md)
- [Sistema de diseño](docs/design-system.md)
- Convenciones del repo: `CLAUDE.md` y `AGENTS.md`
