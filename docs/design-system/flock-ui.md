# Flock UI — Sistema de diseño (referencia para okr-platform-front)

> Fuente: provisto por el usuario el 2026-10-09. Sistema de diseño para los productos internos de Flock IT.
> Todo lo marcado como propuesta está abierto a revisión.

Sistema de diseño para los productos internos de Flock IT (back-offices, herramientas de gestión, tableros). Toma la identidad pública de flockit.com.ar —violeta noche, violeta de marca, naranja de acento, Tomato Grotesk liviana y formas pill— y la lleva a interfaces densas de trabajo diario.

## Principios
- **Marca en los bordes, claridad en el centro.** El violeta y el naranja identifican (header, foco, acción principal); el contenido de trabajo vive sobre `surface` neutra.
- **Denso pero respirado.** Texto por defecto en `body` (14/20); espaciado en el ritmo de 10px del sitio (`space-10`, `space-20`, `space-30`).
- **Pill = acción.** Todo lo que se aprieta o se filtra es pill (`radius-pill`); lo que contiene es `radius-lg`; lo que se completa es `radius-md`.
- **El estado nunca depende solo del color.** Siempre ícono + palabra.

## Voz y contenido
- Español rioplatense con voseo: "Revisá los datos", "Elegí un período". Mantener el voseo en imperativos con tilde ("Agendá", "Exportá").
- Sentence case en títulos, botones y menús ("Exportar a Excel"). Siglas en mayúsculas: TEST, CUIT, PDF.
- Botones con verbo + objeto: "Guardar cambios", "Descartar borrador". Nunca "OK"/"Aceptar" solos en acciones destructivas: "Eliminar partner".
- Tono directo y breve; sin signos de exclamación en la UI, sin emojis.
- Formato argentino: `1.234,56`, `$ 1.234,56`, fechas `dd/mm/aaaa`, hora 24 h `14:32`. IDs y códigos en `code`.
- Errores: qué pasó + cómo seguir. "No pudimos guardar el contrato. Revisá tu conexión y probá de nuevo."

## Color
- Fondo de página `bg`; contenedores `surface`; encabezados de tabla y zonas de filtro `surface-subtle`; menús y modales `surface-raised` con `shadow-overlay`.
- Texto `ink`; secundario `ink-muted`; placeholder y metadatos `ink-subtle`. Nunca texto de color de marca sobre claro salvo `primary-text`.
- Acción principal: relleno `primary` + texto `on-primary`; hover `primary-hover`. **Una sola acción primaria por vista.**
- `accent` (naranja) es borde y señal, no texto: borde 2px de botones de marca, indicador de novedad, anillo de foco (`focus`). Si un relleno es naranja, el texto es `on-accent`.
- Selección (fila, ítem de nav, chip activo): `primary-subtle` con texto `ink` o `primary-text`.
- Estados: `success`, `warning`, `danger`, `info` para texto/ícono/borde; sus `-subtle` para fondos de alertas y badges. `danger` es carmín, deliberadamente más oscuro que el naranja de marca.
- `brand-magenta` queda para ilustración y gráficos; no es un estado.
- Tema claro = trabajo diario (propuesta). Tema oscuro replica el sitio: `bg` = `brand-night`, `surface` = `#331A42` (blanco 10%), bordes = blanco 20%.

### Degradés de marca
Solo en superficies de marca (login, portadas, encabezados de reportes), nunca en UI densa ni detrás de texto chico.

| Degradé | Paradas |
|---|---|
| Horizonte | `brand-violet` → `brand-orange` (izq. a der.) |
| Brasa | `#F04D18` → `#8C00B8` (izq. a der.) |
| Noche | `brand-purple` 0% → `brand-night` 100% (90°) |

Brillos radiales: `brand-purple-deep` → transparente al 59%; `brand-orange` → transparente al 69%. Uno por pantalla como máximo.

## Tipografía
- Familia sans: **Tomato Grotesk** (Light 300, Regular 400, Bold 700). Respaldo mientras no estén los archivos con licencia: **Public Sans**.
- La marca escribe liviano: títulos en 300 (`heading-1`, `heading-2`, `display-*`) con tracking 0.9–1.12px. No usar Bold en títulos grandes.
- UI: `body` por defecto; `body-sm` para labels de campo (en `ink-muted`), ayudas y metadatos; `caption` (12px) es el mínimo.
- Títulos de página `heading-1`; secciones, modales y drawers `heading-2`; cards `heading-3`.
- Botones grandes `button` (16px); medianos y chicos `button-sm`.
- Números en tablas alineados a la derecha; IDs y códigos en `code`.

## Espaciado y layout
- Escala: `space-5`, `space-10`, `space-15`, `space-20`, `space-30`, `space-40`, `space-60` (px).
- Padding de card `space-20` (compacta) o `space-30 space-40`. Gap entre campos `space-15`; entre secciones `space-40`.
- App shell: sidebar 248px (68px colapsada), header 64px, contenido con margen `space-30`. Grilla de 12 columnas con gutter `space-20`.

## Formas, bordes y elevación
- `radius-pill`: botones, chips, tags, filtros, switches, búsqueda.
- `radius-md`: inputs, selects, dropdowns, menús, alertas.
- `radius-lg`: cards, modales, drawers, paneles.
- `radius-sm`: checkbox, badges dentro de tablas, tooltips.
- Bordes `border-1` en `border` para dividir; controles con `border-strong`. Botón de marca: `border-2` en `accent`.
- Elevación mínima: `shadow-sm` solo para cards en claro; `shadow-overlay` para todo lo que flota.

## Estados de interacción
- Hover: un paso más profundo (`primary-hover`) o fondo `surface-subtle` en elementos neutros.
- Foco: anillo `border-2` en `focus` con 2px de separación, siempre visible con teclado.
- Seleccionado: `primary-subtle`. Deshabilitado: opacidad 0.4 y sin cursor; nunca ocultar acciones por permisos sin explicar.
- Movimiento: 150–200 ms, ease-out, solo en aperturas y feedback; respetar `prefers-reduced-motion`.

## Iconografía
- Lucide (ISC): trazo 1.75px, puntas redondeadas, 16px en controles chicos y 18–20px por defecto.
- Color: `ink-muted` por defecto, `primary-text` activo, color de estado solo junto a una palabra.
- Sin emojis como íconos. Ícono solo → `aria-label` o `IconButton` con tooltip.

## Logo
- `assets/Logos/flock-logo.png`: isologo blanco (222×57). Solo sobre `brand-night`, `surface-brand`, `brand-purple` o fotos oscuras.
- Altura mínima 24px en el header; aire alrededor igual a la altura de la "f".
- No recolorear, no estirar, no poner sobre fondo claro (falta versión oscura).

## Gráficos
- Series en orden fijo: `chart-1` (violeta), `chart-2` (naranja), `chart-3` (índigo), `chart-4` (magenta); de la quinta en adelante, agrupar en "Otros" con `chart-other`.
- Un solo eje Y; grilla en `border`, ejes y etiquetas en `ink-subtle`; valores con formato AR. Con dos o más series, leyenda siempre.

## Componentes
Construidos con clases `fk-*` sobre los tokens (`components/bundle.css`). En React 18, `window.FlockUI` expone los componentes y un helper `html`.
- Pantalla tipo: AppShell → PageHeader → SavedViews → FilterBar o FilterGrid → DataTable con TableToolbar y Pagination.
- Detalle: PageHeader con Tabs → Grid 8 + 4 con Card, DescriptionList, Timeline y Comments.
- Ventanas: Modal para 1–5 campos, Drawer para ver o editar sin perder la lista, ConfirmDialog para lo destructivo.

## Accesibilidad
- Todo par de texto declarado cumple 4.5:1 en ambos temas; bordes de control y foco ≥3:1.
- Áreas táctiles de 40px mínimo; 32px solo en tablas compactas.
- Toda acción con ícono solo lleva `aria-label` y tooltip.

## Catálogo de componentes (prioridad P1 = MVP, P2 = gestión completa, P3 = específicos)

### A. Layout y navegación
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 1 | App shell | AppShell | Sidebar + header + contenido | P1 |
| 2 | Header / Top bar | Header | Logo, buscador global, ambiente, notificaciones, usuario | P1 |
| 3 | Sidebar | Sidebar | Navegación lateral colapsable, secciones, contadores | P1 |
| 4 | Page header | PageHeader | Título + breadcrumbs + acciones | P1 |
| 5 | Breadcrumbs | Breadcrumbs | Ubicación en la jerarquía | P1 |
| 6 | Tabs | Tabs | Secciones dentro de una entidad | P1 |
| 7 | Pagination | Pagination | Navegar resultados | P1 |
| 8 | Stepper / Wizard | Stepper | Altas en varios pasos | P2 |
| 9 | Menú de usuario | UserMenu | Perfil, preferencias, tema, cerrar sesión | P2 |
| 10 | Command palette | CommandPalette | Búsqueda global y atajos (Ctrl+K) | P3 |
| 11 | Footer de app | AppFooter | Versión, ambiente, soporte | P3 |

### B. Acciones
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 12 | Button | Button | Primario, secundario, ghost, peligro; 3 tamaños; con ícono; cargando | P1 |
| 13 | Icon button | IconButton | Acciones compactas en tablas y toolbars | P1 |
| 14 | Link | Link | Navegación en texto y celdas | P1 |
| 15 | Dropdown menu | DropdownMenu | Menú de acciones (⋯) | P1 |
| 16 | Split button | SplitButton | Acción principal + alternativas | P2 |
| 17 | Segmented control | SegmentedControl | Alternar vistas o períodos | P2 |
| 18 | Bulk action bar | BulkActionBar | Acciones sobre varias filas | P2 |

### C. Formularios
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 19 | Form field | FormField | Label, requerido, ayuda, error | P1 |
| 20 | Text input | TextInput | Texto con prefijo/sufijo, limpiar, estados | P1 |
| 21 | Textarea | Textarea | Observaciones, comentarios | P1 |
| 22 | Select | Select | Lista cerrada | P1 |
| 23 | Combobox | Combobox | Lista larga con búsqueda | P1 |
| 24 | Multiselect | MultiSelect | Varias opciones con chips | P1 |
| 25 | Checkbox | Checkbox | Opción individual y selección en tablas | P1 |
| 26 | Radio group | RadioGroup | Una opción entre pocas | P1 |
| 27 | Switch | Switch | Activar/desactivar al instante | P1 |
| 28 | Date picker / Range | DatePicker | Fechas y períodos (dd/mm/aaaa) | P1 |
| 29 | Number / Currency input | NumberInput | Importes AR, porcentajes | P1 |
| 30 | Search field | SearchField | Búsqueda pill | P1 |
| 31 | File upload | FileUpload | Adjuntar archivos | P2 |
| 32 | Time picker | TimePicker | Horarios | P3 |
| 33 | Slider / Range | Slider | Rangos numéricos | P3 |
| 34 | Form layout / Fieldset | FormLayout | Grillas de campos, barra de guardar fija | P2 |

### D. Filtros, datos y visualización
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 35 | Filter bar | FilterBar | Filtros rápidos + "Limpiar filtros" | P1 |
| 36 | Filter chip | FilterChip | Filtro activo removible | P1 |
| 37 | Data table | DataTable | Orden, filtros, selección, acciones por fila, densidad | P1 |
| 38 | Table toolbar | TableToolbar | Búsqueda, columnas, exportar, densidad | P1 |
| 39 | Panel de filtros avanzados | FilterPanel | Drawer con criterios | P2 |
| 40 | Vistas guardadas | SavedViews | Filtros con nombre | P3 |
| 41 | Description list | DescriptionList | Detalle clave–valor | P1 |
| 42 | List / List item | List | Listas con avatar, meta y acción | P2 |
| 43 | KPI / Stat card | StatCard | Métrica + variación + sparkline | P2 |
| 44 | Charts | Chart | Barras, líneas, dona | P2 |
| 45 | Timeline / Historial | Timeline | Actividad y auditoría | P2 |
| 46 | Tree view | TreeView | Jerarquías | P3 |
| 47 | Kanban board | KanbanBoard | Estados de tareas | P3 |
| 48 | Calendar | Calendar | Vista mensual/semanal | P3 |

### E. Contenedores y superposiciones
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 49 | Card | Card | Básica, con header y acciones, clickeable | P1 |
| 50 | Modal / Dialog | Modal | Formularios cortos y confirmaciones | P1 |
| 51 | Confirm dialog | ConfirmDialog | Acciones destructivas | P1 |
| 52 | Drawer / Side panel | Drawer | Detalle o edición sin salir de la tabla | P1 |
| 53 | Tooltip | Tooltip | Ayuda breve | P1 |
| 54 | Popover | Popover | Contenido interactivo flotante | P2 |
| 55 | Accordion | Accordion | Secciones colapsables | P2 |
| 56 | Divider | Divider | Separación de bloques | P1 |

### F. Feedback y estado
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 57 | Alert / Banner | Alert | Info, éxito, advertencia, error | P1 |
| 58 | Toast | Toast | Confirmación breve | P1 |
| 59 | Status badge | StatusBadge | Estado de un registro | P1 |
| 60 | Tag / Chip | Tag | Categorías, etiquetas | P1 |
| 61 | Spinner | Spinner | Carga puntual | P1 |
| 62 | Skeleton | Skeleton | Carga de tablas y cards | P2 |
| 63 | Progress bar | ProgressBar | Procesos largos | P2 |
| 64 | Empty state | EmptyState | Sin datos / sin resultados | P1 |
| 65 | Páginas de error | ErrorPage | 404, 500, sin permisos, mantenimiento | P2 |
| 66 | Environment badge | EnvBadge | DEV / TEST / PROD visible | P1 |

### G. Personas y colaboración
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 67 | Avatar / Avatar group | Avatar | Usuarios, responsables, equipos | P1 |
| 68 | User card | UserCard | Persona con rol, equipo y contacto | P3 |
| 69 | Notification center | NotificationCenter | Bandeja de notificaciones | P2 |
| 70 | Comments | Comments | Hilo de comentarios | P3 |

### H. Utilitarios
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 71 | Copy to clipboard | CopyButton | Copiar IDs, links | P2 |
| 72 | Kbd | Kbd | Atajos de teclado | P3 |
| 73 | Login | Login (plantilla) | Pantalla de ingreso con SSO | P2 |

### I. Incorporaciones
| # | Componente | En código | Uso | Prioridad |
|---|---|---|---|---|
| 74 | Grilla de layout | Grid · Col · Stack | 12 columnas con gaps de token | P1 |
| 75 | Filter grid | FilterGrid | Filtros en grilla con Buscar / Limpiar | P1 |
| 76 | Filter dropdown | FilterDropdown | Pill de filtro con checklist | P1 |
| 77 | Íconos | Icon | Lucide | P1 |
| 78 | Plantilla de listado | TemplateList | Filtros, tabla, paginación | P1 |
| 79 | Plantilla de detalle | TemplateDetail | Tabs, ficha, historial, comentarios | P2 |
| 80 | Filtros de tabla | ColumnFilter · DataTable filterMode | Filtro por columna: texto, selección, múltiple, número, fecha | P1 |

## Tokens de color (claro / oscuro)

| Token | Claro | Oscuro |
|---|---|---|
| bg | #f7f5fa | #1c002c |
| accent | #ff5102 | #ff5102 |
| focus | #ff5102 | #ff5102 |
| brand-night | #1c002c | #1c002c |
| brand-purple | #7f07c5 | #7f07c5 |
| brand-purple-deep | #7500b7 | #7500b7 |
| brand-orchid | #9c2ef5 | #9c2ef5 |
| brand-violet | #4f3ae2 | #4f3ae2 |
| brand-orange | #ff5102 | #ff5102 |
| brand-lilac | #e9deff | #e9deff |
| brand-magenta | #fb116f | #fb116f |
| surface | #ffffff | #331a42 |
| surface-subtle | #f1ecf7 | #2a0f39 |
| surface-raised | #ffffff | #40294e |
| surface-brand | #1c002c | #3c0c5e |
| ink | #1c002c | #ffffff |
| ink-muted | #5e4e6b | #c9bfd1 |
| ink-subtle | #766687 | #a698b3 |
| on-brand | #ffffff | #ffffff |
| on-primary | #ffffff | #ffffff |
| on-accent | #1c002c | #1c002c |
| on-danger | #ffffff | #1c002c |
| border | #e3daec | #493356 |
| border-strong | #8e7fa0 | #82738b |
| primary | #7f07c5 | #9c2ef5 |
| primary-hover | #7500b7 | #8a1fe0 |
| primary-text | #7f07c5 | #b98af5 |
| primary-subtle | #e9deff | #420e68 |
| success | #16794a | #5fd39a |
| success-subtle | #e3f5ec | #123a2a |
| warning | #9a5b00 | #ffc266 |
| warning-subtle | #fff1d6 | #3d2a0a |
| danger | #c4123f | #ff7a9c |
| danger-subtle | #fde4ea | #45102a |
| info | #4f3ae2 | #a99bff |
| info-subtle | #e8e5fc | #2a2160 |
| chart-1 | #7f07c5 | #a463f0 |
| chart-2 | #ff5102 | #f04d00 |
| chart-3 | #4f3ae2 | #7a6af2 |
| chart-4 | #fb116f | #f0408a |
| chart-other | #a698b3 | #82738b |

## Aplicación al dominio OKR (decisiones de adaptación)
- Bandas de score → estados: verde = `success`, amarillo = `warning`, rojo = `danger`; SIEMPRE ícono + palabra ("En ruta", "Requiere atención", "En riesgo"), nunca solo color.
- Scores con formato AR: `0,70`; porcentajes `70 %`; fechas `dd/mm/aaaa`.
- Una sola acción primaria por vista (ej. "Publicar ciclo", "Registrar check-in").
- Degradés solo en login y encabezado del PDF por equipo; el PDF usa la paleta `chart-*` y tokens del tema claro.
- Acciones sin permiso se muestran deshabilitadas con explicación, no se ocultan.
