# Demo de OKR Platform

Entorno de demostración con datos realistas, **fuera de ambos repos** (`okr-platform-back` / `okr-platform-front` no se modifican).

## Levantar

```powershell
cd tools\demo
.\demo-up.ps1
```

El script:
0. Verifica Docker (`docker info`); si no corre, intenta abrir Docker Desktop y espera hasta 3 min.
1. Levanta Postgres con `docker compose -p okr-demo up -d db-test` (puerto **55435**, contenedor `okr-demo-db-test-1`).
2. Corre `prisma migrate deploy` y `prisma db seed` (admin + equipo raíz "Flockit").
3. Inicia la API **sin compilar** (`ts-node src/main.ts`) en el puerto **3100** y guarda el PID en `.api.pid` (logs en `.api.log` / `.api.log.err`).
4. Espera `GET http://127.0.0.1:3100/health` (usa 127.0.0.1, no `localhost`: en Windows `localhost` resuelve primero a `::1`, tarda ~2 s en ser rechazado y `Invoke-WebRequest` agota su timeout; tope 300 s con progreso cada 10 s) y ejecuta `seed-demo.mjs`, que carga todo por la API real y muestra un resumen.

> Si el loader ya cargó datos y lo volvés a correr, aborta avisando que la demo está sembrada.

## Front

No lo inicia el script. Desde `okr-platform-front`:

```powershell
$env:API_URL="http://localhost:3100"; npx next dev -p 3101
```

(Opcional: si querés que `demo-down.ps1` lo detenga, guardá su PID en `tools\demo\.front.pid`.)

## IA de accesibilidad cognitiva (opcional)

`demo-up.ps1` intenta levantar también el agente (`okr-platform-agent`, o `apps/agent` en el monorepo) **sin compilar**, con `python -m uvicorn` desde su `.venv`, en el puerto **8098**. Solo lo hace si existen `okr-platform-agent\.env` (con `NVIDIA_NIM_API_KEY`) y `okr-platform-agent\.venv`; si falta alguno, la demo corre igual con `AI_ENABLED=false` y el front oculta las ayudas de IA.

- El script genera un `AGENT_SHARED_SECRET` aleatorio por corrida (no lee ni guarda el del `.env`) y se lo pasa a la API junto con `AI_ENABLED=true` y `AGENT_URL=http://127.0.0.1:8098`.
- PID en `.agent.pid`, logs en `.agent.log` / `.agent.log.err`; `demo-down.ps1` lo detiene (verifica la línea de comandos antes de matarlo).
- Para probar la degradación: detené el agente (`demo-down.ps1` o matá el PID) y repetí un pedido; la API responde 503 `AI_UNAVAILABLE` y la UI muestra la nota de servicio no disponible.
- Los modelos y el costo son los de `okr-platform-agent/config/models.yaml` (fuente de verdad). El costo en USD que muestra `admin/uso-ia` es una estimación: el free tier de NVIDIA no factura.

## URLs

| Qué | URL |
| --- | --- |
| Front | http://localhost:3101 |
| API | http://localhost:3100 |
| Swagger | http://localhost:3100/api |

## Credenciales (clave de todos: `DemoFlock2026`)

| Rol | Email |
| --- | --- |
| ADMIN | admin@flockit.com.ar |
| LEADER (Producto Digital) | laura.gomez@flockit.com.ar |
| LEADER (Comercial) | valentina.rios@flockit.com.ar |
| MEMBER (Producto Digital) | martin.ruiz@flockit.com.ar |
| MEMBER (Producto Digital) | sofia.pereyra@flockit.com.ar |
| MEMBER (Comercial) | diego.fernandez@flockit.com.ar |

## Qué datos hay

- Equipos "Producto Digital" y "Comercial" bajo la raíz; ciclos anual "2026" y "Q4 2026" (semanal, umbrales 1.0 / 0.7), ambos ACTIVE.
- 3 objetivos anuales (de la organización) y 15 objetivos en Q4: 3 individuales con 3 KRs para Martín, Sofía y Diego, más 3 de equipo para cada equipo. Mezcla de COMMITTED/ASPIRATIONAL, TOP_DOWN/BOTTOM_UP, KRs DERIVED (clientes, %, días, USD, horas...) incluidos decrecientes, y KRs MANUAL; varios alineados.
- Check-ins en verde, amarillo y rojo, y varios KRs sin check-ins ("Sin check-ins").
- KRs vencidos (objetivo de Sofía "sistema de diseño" y una visita de Diego), retrodatados por SQL solo contra la DB demo.
- 4 mensajes de feedback (uno editado, dos sin leer) y 3 reconocimientos ligados a hitos.

## Detener

```powershell
.\demo-down.ps1
```

Verifica la línea de comandos del PID antes de matarlo, ejecuta `docker compose -p okr-demo down -v` y confirma que los puertos 3100 y 55435 quedaron libres.

## Importante: los datos son efímeros

La DB usa `tmpfs` (RAM): al bajar el contenedor, o reiniciar Docker, **se pierde todo**. Para una demo está bien; para recargar basta con correr `demo-down.ps1` y `demo-up.ps1`.

## Notas

- Se usa `LOGIN_THROTTLE_LIMIT=1000` solo en la API demo, porque el loader hace varios logins seguidos.
- No toca los puertos 3000/3001/55434 ni otros contenedores.
