# Manuales de OKR Platform

Esta carpeta tiene los manuales vigentes.

| Archivo                                  | Para quién                      |
| ---------------------------------------- | ------------------------------- |
| [`manual-usuario.md`](manual-usuario.md) | Integrantes y líderes de equipo |
| [`manual-admin.md`](manual-admin.md)     | Administración                  |

Las capturas están en `../manual/img/`. El archivo `../manual-usuario.md` es la versión anterior y quedó reemplazado.

## Cómo están armados

- Cada manual empieza con un bloque con `title`, `audience`, `version` y `updated`.
- Hay un H2 por área de tarea y un H3 por tarea. Los títulos de tarea empiezan con "Cómo..." o "Qué...".
- Los títulos no llevan números. Así los enlaces internos (anclas) no se rompen al reordenar.
- La ayuda de la app y el chat de administración parten los manuales por título y citan la sección. Por eso:
  - no cambies el texto de un título sin necesidad;
  - si lo cambiás, buscá los enlaces que lo usan;
  - cada sección debe entenderse sola, sin "como vimos arriba".

## Lista de control de lenguaje claro

Basada en la norma UNE-ISO 24495-1 y coherente con el RD 707/2026 (art. 3.j y 5). Revisala antes de publicar un cambio.

1. **Lector primero.** Escribí para quien usa la herramienta, no para quien la construyó.
2. **Frases cortas.** Apuntá a 20 palabras o menos por frase.
3. **Voz activa.** "Hacé clic en Guardar", no "Se deberá hacer clic".
4. **Palabras comunes.** Evitá la jerga. Si no hay otra, explicala la primera vez.
5. **Una idea por párrafo.**
6. **Títulos de tarea.** Que digan qué logra la persona: "Cómo creo un ciclo".
7. **Pasos numerados.** Un verbo por paso, en orden.
8. **Siglas explicadas.** OKR, KR, IA, p50 y p95 se explican donde aparecen y en el glosario.
9. **Ejemplos concretos.** Usá los datos de la demo (Producto Digital, Comercial, "Q4 2026").
10. **Textos exactos de la pantalla.** Los botones y menús van en **negrita** y con el mismo texto de la app.
11. **Estado nunca solo por color.** Siempre ícono y palabra: En ruta, Requiere atención, En riesgo.
12. **Voseo es-AR, tono neutro.** "Hacé", "elegí", "revisá". Sin modismos.
13. **Cada término técnico está en el glosario.**
14. **Un mismo nombre para una misma cosa.** Rol **Líder** (toda la plataforma) y **Líder del equipo** (un equipo). Botón **Me sirve** en las versiones adaptadas y en el resumen de check-ins.

## Cómo actualizar los manuales

1. Cambiá la pantalla o la regla en el código.
2. Buscá los textos exactos en los archivos `messages.ts` de cada módulo, en `src/app/(app)/`.
3. Editá el manual que corresponda. Si cambia algo del RD 707/2026, mirá `okr-platform-back/docs/arquitectura.md`.
4. Pasá la lista de control de arriba.
5. Subí `version` si cambió el contenido. Actualizá `updated` con la fecha.
6. Si cambiaste una pantalla, reemplazá la captura en `../manual/img/`. No borres capturas que otro manual use.
7. Corré `npm run help:build` y subí los JSON generados (ver más abajo).
8. Completá la sección "Asistente de administración (próximamente)" de `manual-admin.md` cuando salga el chat.

## Dónde mirar si algo no coincide

| Tema                                                             | Fuente                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Reglas de negocio, límites, bandas                               | `okr-platform-back/docs/arquitectura.md`, sección 5                                       |
| Permisos por rol                                                 | `okr-platform-back/docs/arquitectura.md`, sección 3                                       |
| Cumplimiento RD 707/2026                                         | `okr-platform-back/docs/arquitectura.md`, sección "Cumplimiento RD 707/2026"              |
| Textos de la interfaz                                            | `messages.ts` de cada módulo                                                              |
| Etiquetas de la pantalla Auditoría (acciones, elementos, campos) | `src/app/(app)/admin/auditoria/audit-diff.ts`                                             |
| Pedidos de documentos adaptados (formatos, estados, plazos)      | `src/app/(app)/pedidos-adaptacion/messages.ts` y `okr-platform-back/docs/arquitectura.md` |
| Quién valida una versión adaptada                                | `okr-platform-back/okr-platform/src/ai/domain/access.ts` (`canValidateAdaptation`)        |
| Datos de la demo                                                 | `tools/demo/README.md`                                                                    |

## Cómo se genera la ayuda de la app (`/ayuda`)

La ayuda de la app y el índice del asistente salen de estos mismos Markdown. No hay que copiar nada a mano.

```bash
npm run help:build   # genera todo (corre solo en predev y prebuild)
npm run help:check   # no escribe: falla si lo generado quedó viejo
```

| Salida                                               | Qué es                                                                            | Se versiona |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| `src/app/(app)/ayuda/_generated/help.generated.json` | AST de cada manual + secciones + tamaño de las capturas. Solo lo lee el servidor. | Sí          |
| `docs/manuales/help-index.json`                      | Índice plano para el asistente del back (ver abajo).                              | Sí          |
| `public/ayuda/img/*.png`                             | Capturas que citan los manuales, copiadas desde `docs/manual/img/`.               | No          |

- El script es `scripts/build-help.mjs` (lógica pura en `scripts/help/lib.mjs`). Usa `marked` 18.0.14 y `github-slugger` 2.0.0, ambos `devDependencies` fijadas: corren al compilar, no viajan al navegador.
- El Markdown **no se convierte en HTML**. Se arma un árbol propio (párrafos, listas, tablas, enlaces, imágenes) y la página lo dibuja con React, que escapa todo. El HTML suelto dentro del Markdown se muestra como texto. Solo se admiten enlaces `#ancla`, `manual-usuario.md`, `manual-admin.md`, `http(s)` y `mailto`; y solo imágenes de `../manual/img/*.png`.
- El build **falla** si un enlace interno `#ancla` no existe o si una captura falta. Un test (`help-build.test.ts`) también falla si los archivos generados no coinciden con el Markdown: después de editar un manual, corré `npm run help:build` y subí los dos JSON.
- Quién ve qué: el manual de usuario lo ven todas las personas; el de administración, solo el rol Administración (el resto recibe 404).
- Rutas: `/ayuda` (buscador y manuales) y `/ayuda/usuario`, `/ayuda/admin`. Enlace profundo: `/ayuda/<manual>#<ancla>`.

### Anclas (algoritmo de slug)

Se usa **github-slugger 2.0.0**, una instancia nueva por manual. Se le pasa el texto plano de cada título (H1 a H6, en orden de aparición, sin negritas ni código):

1. pasa a minúsculas;
2. quita todo lo que no sea letra, número, espacio, guion o guion bajo (puntuación, signos `¿?¡!`, `/`, `:`, emojis);
3. cambia cada espacio por `-`;
4. **conserva las letras con tilde y la ñ** (`Cómo creo un ciclo` pasa a `cómo-creo-un-ciclo`);
5. si el slug ya se usó en ese manual, agrega `-1`, `-2`... (el primero queda sin sufijo).

Ejemplos: `¿Qué es la mezcla 50/50?` pasa a `qué-es-la-mezcla-5050`; `Check-ins` pasa a `check-ins`.

### `help-index.json` (para el asistente del back)

Archivo: `okr-platform-front/docs/manuales/help-index.json`. Forma:

```json
{
  "schemaVersion": 1,
  "slugAlgorithm": "github-slugger@2.0.0",
  "sourceHash": "<sha256 de los dos manuales con saltos de línea LF>",
  "manuals": [
    {
      "id": "usuario|admin",
      "title": "",
      "audience": "",
      "version": "",
      "updated": "",
      "roles": ["ADMIN"]
    }
  ],
  "sections": [
    {
      "id": "admin#cómo-creo-un-usuario",
      "manual": "admin",
      "anchor": "cómo-creo-un-usuario",
      "title": "Cómo creo un usuario",
      "level": 3,
      "parent": "usuarios",
      "url": "/ayuda/admin#cómo-creo-un-usuario",
      "plainText": "texto de la sección sin formato (pasos, tablas como `a | b`)"
    }
  ]
}
```

- Una entrada por cada título (H1, H2 y H3 y más). `plainText` es el texto **hasta el siguiente título de cualquier nivel**: el H2 trae solo su introducción; los pasos están en cada H3. `parent` es el ancla del H2 que contiene a un H3 (si no, `null`).
- `id` = `<manual>#<ancla>`. Esos ids son los que el asistente cita; `url` es la ruta de la app (el ancla va sin codificar: el navegador la codifica).
- Roles: `roles` indica quién puede leer ese manual. El asistente de administración solo debe citar el manual `admin` a quien tenga rol ADMIN.
