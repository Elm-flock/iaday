# Manual de usuario · OKR Platform

> **Este manual fue reemplazado.** La versión vigente está dividida por rol en [`manuales/manual-usuario.md`](manuales/manual-usuario.md) (integrantes y líderes) y [`manuales/manual-admin.md`](manuales/manual-admin.md) (administración). Este archivo se conserva como referencia histórica y sus capturas (`manual/img/`) siguen en uso. No lo actualices.

Guía para las personas que usan OKR Platform en Flock IT: integrantes, líderes y administración. No hace falta ningún conocimiento técnico.

> Las capturas se tomaron con datos de ejemplo (ciclos "2026" y "Q4 2026"). Lo que veas en tu cuenta puede variar.

## Contenido

1. [Introducción](#1-introducción)
2. [Ingreso y navegación](#2-ingreso-y-navegación)
3. [Qué puede hacer cada rol](#3-qué-puede-hacer-cada-rol)
4. [Guía para integrantes](#4-guía-para-integrantes)
5. [Guía para líderes](#5-guía-para-líderes)
6. [Guía para administración](#6-guía-para-administración)
7. [Preguntas frecuentes](#7-preguntas-frecuentes)
8. [Glosario](#8-glosario)

---

## 1. Introducción

### ¿Qué es OKR Platform?

OKR Platform es la herramienta de Flock IT para definir objetivos, medir cómo avanzan y conversar sobre ese avance. Reúne en un solo lugar:

- **Objetivos y resultados clave (OKRs)** de cada persona y de cada equipo.
- **Check-ins**: los avances que cada responsable registra periódicamente.
- **Feedback privado** entre dos personas.
- **Reconocimientos públicos** de logros concretos.
- **Reportes PDF** por equipo y ciclo.

Los resultados de los OKRs **no se vinculan con compensaciones ni bonos**: sirven para enfocarse y aprender, no para evaluar. Por eso la plataforma no muestra rankings ni conteos por persona, y el feedback nunca aparece en reportes.

### Conceptos básicos

**Objetivo.** Lo que se quiere lograr, dicho de forma cualitativa e inspiradora. Ejemplo: _"Simplificar el onboarding de los clientes nuevos"_. Cada objetivo pertenece a una persona o a un equipo, y a un ciclo.

- Cada responsable define **entre 3 y 5 objetivos por ciclo**.
- Cada objetivo tiene **entre 3 y 5 resultados clave**.

**Resultado clave (KR).** La forma de medir si el objetivo avanza. Puede ser de dos tipos:

| Tipo                        | Cómo se mide                                                            | Ejemplo                                          |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| **Numérico**                | Desde un valor inicial hasta una meta, con una unidad.                  | "Reducir el tiempo de onboarding de 14 a 5 días" |
| **Manual (se cumple o no)** | Quien registra el avance elige un puntaje de 0,0 a 1,0 en pasos de 0,1. | "Validar el prototipo con 5 usuarios"            |

Cada KR tiene una persona responsable de ejecutarlo.

**Check-in.** El registro de avance de un resultado clave: qué vas a hacer (continuar, actualizar, iniciar o detener), el valor actual o el puntaje y, si querés, una nota.

**Puntaje (score).** Número entre **0,00 y 1,00** que indica qué tan cerca está algo de su meta.

- En un KR numérico se calcula como _(valor actual − inicio) ÷ (meta − inicio)_, limitado entre 0 y 1. Funciona también con metas a la baja (por ejemplo, bajar de 14 a 5 días).
- En un KR manual es el puntaje elegido en el check-in.
- El puntaje de un **objetivo** es el **promedio simple de todos sus resultados clave** (incluidos los que todavía no tienen check-ins, que valen 0).

**Bandas de estado.** El puntaje se muestra siempre con un ícono y una palabra, no solo con color:

| Banda                            | Puntaje     | Qué significa                      |
| -------------------------------- | ----------- | ---------------------------------- |
| Verde · **En ruta**              | 0,70 a 1,00 | Avanza como se esperaba.           |
| Amarillo · **Requiere atención** | 0,40 a 0,69 | Hay avance, pero conviene revisar. |
| Rojo · **En riesgo**             | 0,00 a 0,39 | Está lejos de la meta.             |

Además hay dos estados neutros:

- **Sin check-ins** (gris): el KR o el objetivo todavía no tiene ningún avance registrado, así que no se le asigna banda.
- **Check-in vencido**: pasó más tiempo que la cadencia del ciclo sin registrar un avance (ver [Ciclos](#ciclos)).

**Comprometido vs. aspiracional.** Al crear un objetivo elegís su tipo:

- **Comprometido**: se espera cumplirlo por completo (puntaje 1,00).
- **Aspiracional**: es una apuesta ambiciosa; alcanzar alrededor de 0,70 ya se considera un éxito.

El umbral exacto de "logrado" lo define cada ciclo. En los ciclos de ejemplo es **1,00 para comprometidos y 0,70 para aspiracionales**. Al cerrarse el ciclo, cada objetivo muestra su **puntaje final** y si quedó **Logrado** o **No logrado** según ese umbral.

**Origen: top-down vs. bottom-up.** Cada objetivo indica de dónde nace:

- **Top-down**: baja desde la dirección.
- **Bottom-up**: nace en las personas.

Lo ideal es que en cada equipo ambos orígenes estén entre 40 % y 60 % (la "mezcla 50/50"). Si se sale de ese rango verás un aviso suave; nunca bloquea nada.

**Alineación.** Un objetivo puede alinearse a otro ya publicado (incluso de otro ciclo), por ejemplo el objetivo trimestral de una persona con el objetivo anual de la organización. En el detalle de cada objetivo ves a qué se alinea y qué objetivos se alinean a él.

<a id="ciclos"></a>**Ciclos.** Los objetivos se organizan en ciclos con fecha de inicio y fin:

- **Anual**: estratégico (por ejemplo, "2026").
- **Trimestral**: táctico, dentro de un anual (por ejemplo, "Q4 2026").

Cada ciclo tiene una **cadencia de check-in**: semanal (7 días), quincenal (14 días) o mensual (30 días). Si un KR de un objetivo publicado pasa más de ese tiempo sin check-in (contando desde el último check-in o, si no hubo ninguno, desde la publicación), queda **vencido** y aparece en tus pendientes.

Estados de un ciclo: **Borrador**, **Activo** y **Cerrado**.

**Estados de un objetivo:**

| Estado        | Qué implica                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| **Borrador**  | Solo lo ven quienes pueden editarlo. Se puede modificar todo y eliminarlo. Todavía no admite check-ins. |
| **Publicado** | Lo ve toda la organización. Admite check-ins. Ya no se puede eliminar ni cambiar su tipo u origen.      |
| **Cerrado**   | El ciclo terminó. Muestra el puntaje final y si se logró. No admite check-ins.                          |

---

## 2. Ingreso y navegación

### Ingresar

1. Abrí la dirección de OKR Platform en tu navegador.
2. Escribí tu **email de trabajo** y tu **contraseña**.
3. Hacé clic en **Ingresar**.

![Pantalla de ingreso](manual/img/01-login.png)

Si algo falla verás un mensaje:

- _"No pudimos iniciar sesión. Revisá el email y la contraseña."_: el email o la contraseña no coinciden (o tu usuario está desactivado).
- _"Hiciste demasiados intentos. Esperá un minuto y probá de nuevo."_: se bloqueó temporalmente por muchos intentos.

No hay opción de "olvidé mi contraseña": si la perdiste, pedile a administración que la restablezca.

### Pantalla principal y menú

Después de ingresar llegás a **Inicio**. La pantalla tiene tres zonas:

- **Barra superior**: tu nombre, tu rol (Integrante, Liderazgo o Administración) y el botón **Cerrar sesión**. A la izquierda, el botón para colapsar o expandir el menú lateral.
- **Menú lateral**: Inicio, Objetivos, Check-ins, Equipos, Ciclos, Feedback, Reconocimientos y Usuarios. Junto a **Check-ins** aparece un número con la cantidad de check-ins vencidos que tenés.
- **Contenido** de la sección elegida.

![Inicio de una integrante](manual/img/02-inicio-miembro.png)

Cuando una acción no está disponible para vos, no se oculta: aparece deshabilitada y con la explicación al lado (por ejemplo, _"Solo administración puede gestionar usuarios."_ junto a **Usuarios**).

### Cerrar sesión

Hacé clic en **Cerrar sesión**, arriba a la derecha. Volvés a la pantalla de ingreso.

---

## 3. Qué puede hacer cada rol

| Tarea                                              |                   Integrante                    |               Líder                |                Administración                 |
| -------------------------------------------------- | :---------------------------------------------: | :--------------------------------: | :-------------------------------------------: |
| Ver Inicio, objetivos publicados, equipos y ciclos |                       Sí                        |                 Sí                 |                      Sí                       |
| Crear objetivos propios                            |                       Sí                        |                 Sí                 |                      Sí                       |
| Crear objetivos de un equipo                       |                       No                        |     De los equipos que lidera      |              De cualquier equipo              |
| Crear objetivos para otra persona                  |                       No                        |                 No                 |                      Sí                       |
| Editar un objetivo y sus KRs                       |                   Los propios                   |      Propios y de sus equipos      |                     Todos                     |
| Cambiar inicio y meta de un KR ya publicado        |                       No                        | Sí (sus equipos y sus integrantes) |                      Sí                       |
| Registrar check-ins                                | En KRs propios, de sus objetivos o de su equipo |   Igual, más los de sus equipos    | Igual que el resto (no tiene acceso especial) |
| Dar y recibir feedback privado                     |                       Sí                        |                 Sí                 |                      Sí                       |
| Reconocer logros en el muro                        |                       Sí                        |                 Sí                 |                      Sí                       |
| Descargar el reporte PDF de un equipo              |                       No                        |       Sí (solo sus equipos)        |                      Sí                       |
| Ver la mezcla 50/50 de su equipo en Inicio         |                       No                        |                 Sí                 |           No (la ve en cada equipo)           |
| Crear y editar ciclos, activarlos y cerrarlos      |                       No                        |                 No                 |                      Sí                       |
| Crear y editar equipos e integrantes               |                       No                        |                 No                 |                      Sí                       |
| Gestionar usuarios (alta, rol, estado, contraseña) |                       No                        |                 No                 |                      Sí                       |

> "Líder" se refiere a quien figura como **Líder** de un equipo. Las opciones de líder se aplican solo a los equipos que esa persona lidera.

---

## 4. Guía para integrantes

### 4.1 Ver cómo venís (Inicio)

**Inicio** responde en segundos "¿cómo vengo?" para el ciclo vigente. Podés cambiar de ciclo con el selector **Ciclo**.

- **Mis objetivos**: tus objetivos individuales y, en un grupo aparte, los de los equipos a los que pertenecés. Cada uno muestra su estado (banda, "Sin check-ins" o "Check-in vencido"), el puntaje y cuántos KRs tienen check-in (por ejemplo, "2 de 3 KRs con check-in").
- **Check-ins pendientes**: los KRs vencidos (hasta 5) y el botón **Registrar check-in**. Si no hay ninguno: _"Estás al día con tus check-ins."_
- **Reconocimientos recientes**: los que recibiste ("Para vos") y los últimos del muro.
- **Aviso de feedback**: si tenés feedback sin leer, verás _"Tenés N feedback sin leer."_ con un enlace. Nunca se muestra el contenido ni quién lo envió.

### 4.2 Ver tus pendientes de check-in

1. Hacé clic en **Check-ins** en el menú.
2. Verás tus resultados clave vencidos agrupados por objetivo, con la fecha del último check-in o de la publicación.
3. Usá **Registrar check-in** en el KR que quieras actualizar.

![Check-ins pendientes](manual/img/03-check-ins-pendientes.png)

### 4.3 Consultar un objetivo

1. Entrá a **Objetivos** (o hacé clic en un objetivo desde Inicio).
2. Usá los filtros **Ciclo**, **Equipo responsable**, **Persona responsable** y **Estado** para encontrarlo. Los objetivos aparecen agrupados por responsable.

![Lista de objetivos](manual/img/06-lista-objetivos.png)

3. Hacé clic en el objetivo para abrir su detalle:
   - **Resumen**: estado, tipo, origen, responsable, ciclo, descripción y puntaje.
   - **Alineación**: a qué objetivo se alinea y cuáles se alinean a este.
   - **Resultados clave**: tabla con tipo, inicio, meta, valor actual, unidad, puntaje y banda de cada KR, con sus acciones.
   - **Historial de check-ins**: cada avance con fecha y hora, autor, acción, valor, puntaje y nota.

![Detalle de un objetivo](manual/img/04-detalle-objetivo.png)

### 4.4 Crear un objetivo

1. En **Objetivos**, hacé clic en **Crear objetivo**.
2. Completá:
   - **Ciclo**: solo aparecen ciclos no cerrados.
   - **Responsable**: como integrante, solo podés elegirte a vos (los objetivos de equipo los crea su líder).
   - **Título** y, opcionalmente, **Descripción**.
   - **Tipo**: Comprometido o Aspiracional.
   - **Origen**: Top-down o Bottom-up.
   - **Alineado a** (opcional): un objetivo ya publicado, incluso de otro ciclo.
3. Hacé clic en **Crear objetivo**.

![Formulario para crear un objetivo](manual/img/07-nuevo-objetivo.png)

El objetivo se crea como **borrador**. El paso siguiente es agregarle resultados clave.

### 4.5 Agregar o editar resultados clave

1. En el detalle del objetivo, hacé clic en **Agregar resultado clave**.
2. Completá:
   - **Resultado clave**: qué vas a medir.
   - **Cómo se mide**: Numérico o Manual (se cumple o no).
   - Si es numérico: **Valor inicial**, **Meta** y **Unidad** (por ejemplo: clientes, %, días).
   - **Responsable**: quien lo va a ejecutar.
3. Hacé clic en **Agregar resultado clave**.

![Agregar un resultado clave](manual/img/08-agregar-resultado-clave.png)

Para modificar un KR usá el ícono de lápiz en su fila; para quitarlo, el ícono de papelera (solo mientras el objetivo es borrador).

### 4.6 Publicar un objetivo

1. En el detalle del objetivo en borrador, hacé clic en **Publicar**.
2. Leé la confirmación y hacé clic en **Publicar objetivo**.

Para poder publicar hacen falta:

- Al menos **3 objetivos del mismo responsable** en el ciclo (hasta 5).
- Al menos **3 resultados clave** en el objetivo que publicás.

Si falta algo, la plataforma te explica qué completar. Después de publicar:

- Lo ve toda la organización y ya **no se puede eliminar**.
- No se pueden cambiar el **tipo** ni el **origen**. Sí podés editar el título, la descripción y la alineación.
- Solo un líder o administración pueden cambiar el **inicio** y la **meta** de los KRs.
- No se pueden quitar resultados clave (sí agregar nuevos).

Un borrador se puede eliminar con **Eliminar** desde su detalle.

### 4.7 Registrar un check-in

1. Abrí el detalle del objetivo (o andá a **Check-ins**) y hacé clic en **Registrar check-in** en la fila del KR.
2. En el panel lateral elegí **¿Qué vas a hacer?**:
   - **Continuar**: seguimos igual, lo que hacemos funciona.
   - **Actualizar**: cambió el valor y quiero reflejarlo.
   - **Iniciar**: voy a empezar algo nuevo para avanzar.
   - **Detener**: voy a dejar de hacer algo que no suma.
3. Cargá el **Valor actual** (KR numérico) o elegí el **puntaje** de 0,0 a 1,0 (KR manual). El recuadro **"Así quedaría el resultado clave"** te muestra el puntaje y la banda antes de guardar.
4. Opcionalmente escribí una **Nota** (hasta 2000 caracteres) contando qué pasó o qué necesitás.
5. Hacé clic en **Registrar check-in**.

![Registrar un check-in](manual/img/05-registrar-check-in.png)

El puntaje del KR y del objetivo se actualizan al instante, y el avance queda en el historial.

Podés registrar check-ins si sos responsable del KR, responsable del objetivo, integrante del equipo responsable o su líder. Si el botón está deshabilitado verás el motivo: el objetivo todavía es borrador, ya está cerrado o no tenés permiso.

### 4.8 Feedback privado

El feedback es una conversación **privada entre dos personas**: solo lo ven quien lo escribe y quien lo recibe. Ni administración, ni líderes, ni terceros pueden verlo, y no aparece en reportes.

**Ver tu bandeja**

1. Hacé clic en **Feedback**.
2. Usá las pestañas **Recibido** y **Enviado**. Los mensajes nuevos aparecen como **Sin leer**.
3. Abrí un mensaje para leerlo completo; al abrirlo queda marcado como leído.

![Bandeja de feedback](manual/img/09-feedback-bandeja.png)

**Dar feedback**

1. En **Feedback**, hacé clic en **Dar feedback**.
2. Elegí **Para quién**.
3. Escribí el **Mensaje** (hasta 2000 caracteres). Contá qué viste, qué impacto tuvo y qué podría seguir o cambiar.
4. Opcionalmente, enlazá un **objetivo o resultado clave relacionado**.
5. Hacé clic en **Enviar feedback**.

![Dar feedback](manual/img/10-dar-feedback.png)

Quien escribió un feedback puede **editarlo** o **eliminarlo** desde su detalle. Si se edita, aparece la marca "Editado".

### 4.9 Reconocimientos

El muro de **Reconocimientos** es público: sirve para agradecer logros concretos. No hay puntos, rankings ni posiciones.

**Ver el muro**

1. Hacé clic en **Reconocimientos**.
2. Para ver los de una persona, elegila en **Filtrar por persona** y hacé clic en **Filtrar**.

Cada tarjeta muestra quién reconoce a quién, el mensaje, el logro (con su banda y su puntaje **actual**) y la fecha. El muro muestra 10 por página, del más nuevo al más viejo.

![Muro de reconocimientos](manual/img/11-muro-reconocimientos.png)

**Reconocer un logro**

1. Hacé clic en **Reconocer un logro**.
2. Elegí la **Persona** y hacé clic en **Continuar**.
3. Elegí el **Logro**: se ofrecen los resultados clave de esa persona con puntaje de **0,70 o más** y sus objetivos ya cerrados.
4. Escribí el **Mensaje**: qué hizo y por qué importó.
5. Hacé clic en **Reconocer logro**.

![Reconocer un logro](manual/img/12-reconocer-logro.png)

No podés reconocerte a vos mismo. Si la persona todavía no tiene logros que cumplan la regla, la lista queda vacía.

### 4.10 Consultar equipos y ciclos

- **Equipos** muestra cómo se organiza Flock IT (un árbol de equipos). En cada equipo ves los integrantes, quién lidera, la mezcla 50/50 del ciclo elegido y, si administrás o liderás ese equipo, el botón **Descargar reporte PDF** (ver [5.3](#53-descargar-el-reporte-pdf-del-equipo)).
- **Ciclos** muestra los ciclos anuales con sus trimestres, sus fechas y su estado. En cada ciclo ves la cadencia de check-in y los umbrales de logro.

### 4.11 Ayuda de IA: versión accesible, sugerir redacción y resumen

OKR Platform puede usar inteligencia artificial (IA) para que los textos sean más fáciles de leer. La ayuda es **opcional**: si la IA está apagada o no responde, no ves los botones (o ves un aviso) y todo lo demás funciona igual. La IA **nunca cambia nada por su cuenta**: siempre decidís vos.

**Ver un texto en lectura fácil o en lenguaje claro**

1. En el detalle de un objetivo, en un check-in del historial o en el detalle de un feedback, hacé clic en **Ver en lectura fácil** o en **Ver en lenguaje claro**.
2. Aparece la versión adaptada debajo del texto original, con la marca **Generado por IA · pendiente de validación**.
3. Si te sirve, hacé clic en **Me sirve**. Solo puede hacerlo quien pidió la versión.
4. Si aparece **Requiere revisión humana**, la IA no pudo garantizar que la versión sea fiel y se muestra el texto original: pedile a alguien que lo revise.

**Validar una versión (administración y liderazgo)**

Administración y quien lidera el equipo del objetivo pueden hacer clic en **Validar**. Podés corregir el texto (manteniendo los mismos bloques) y dejar una nota. Después la marca pasa a **Validado por una persona**. Quien es dueño del objetivo no puede validar su propia versión. El **feedback no se valida**: es privado entre dos personas, así que solo podés marcar **Me sirve**.

**Sugerir redacción**

Al crear un objetivo o un resultado clave, escribí un borrador y hacé clic en **Sugerir redacción**. La sugerencia aparece aparte, con observaciones sobre tu borrador y los valores que propone la IA resaltados (revisalos). Con **Usar sugerencia** se completan los campos del formulario (no se guarda nada hasta que vos lo envíes) y con **Descartar** se cierra.

**Resumir check-ins**

En el historial de cada resultado clave, **Resumir check-ins** muestra un resumen del avance, la tendencia (Mejorando, Estable, Empeorando o Pocos datos), lo destacado y los riesgos. Habla del resultado clave, nunca evalúa a las personas.

---

## 5. Guía para líderes

Como líder podés hacer todo lo de la [guía para integrantes](#4-guía-para-integrantes), y además lo siguiente para los equipos que liderás.

### 5.1 Inicio de líder

En **Inicio** aparecen:

- En **Mis objetivos**, los objetivos de tus equipos.
- La tarjeta **Mis equipos**, con la mezcla top-down / bottom-up de cada equipo en el ciclo (por ejemplo, "Top-down 44 % · Bottom-up 56 % · Equilibrado") y un enlace al detalle del equipo.
- En **Check-ins pendientes**, también los KRs vencidos de los objetivos de tus equipos.

![Inicio de una líder](manual/img/13-inicio-lider.png)

### 5.2 Objetivos de equipo

- Al **crear un objetivo**, en **Responsable** podés elegirte a vos o a los equipos que liderás. Los objetivos individuales de tus integrantes los crea cada persona.
- Podés **editar** los objetivos de tus equipos y sus KRs, y **publicarlos** siguiendo las mismas reglas (3 a 5 objetivos, al menos 3 KRs cada uno).
- Después de publicar, podés cambiar el **inicio** y la **meta** de los KRs de tus equipos y de los objetivos individuales de tus integrantes. Si no corresponde, la plataforma te lo informa al guardar.
- Podés **registrar check-ins** en los KRs de los objetivos de tus equipos.

### 5.3 Descargar el reporte PDF del equipo

1. Andá a **Equipos** y abrí tu equipo (o usá el enlace desde **Mis equipos** en Inicio).
2. En **Mezcla de objetivos (50/50)**, elegí el **Ciclo**.
3. Hacé clic en **Descargar reporte PDF**. Se descarga un archivo con nombre del tipo `reporte-producto-digital-q4-2026.pdf`.

![Detalle del equipo con la mezcla 50/50 y el botón del reporte](manual/img/14-detalle-equipo-lider.png)

Si elegís **Sin ciclo**, el botón queda deshabilitado con la explicación: el reporte siempre corresponde a un ciclo.

El PDF incluye la mezcla de origen y cada objetivo del equipo con sus resultados clave, su estado, su puntaje y la fecha del último check-in. **Nunca incluye feedback, rankings ni datos de compensación**, y las personas aparecen en orden alfabético.

![Primera página del reporte PDF](manual/img/15-reporte-pdf-equipo.png)

> El reporte lo pueden descargar **administración y los líderes de ese equipo**. Quienes integran el equipo, o lideran otro, no ven el botón.

### 5.4 Lo que un líder no puede hacer

Agregar o quitar integrantes, cambiar quién lidera un equipo, y crear o editar equipos, ciclos y usuarios son tareas de administración. En esas pantallas verás los botones deshabilitados con el motivo.

---

## 6. Guía para administración

Administración puede hacer todo lo de las guías anteriores y, además, gestionar ciclos, equipos y usuarios. En **Inicio** tiene la tarjeta **Gestión** con el ciclo activo y accesos directos a Ciclos, Equipos y Usuarios.

![Inicio de administración con la tarjeta Gestión](manual/img/16-inicio-admin.png)

Al crear objetivos, administración puede elegir como responsable a **cualquier persona o equipo**.

> Administración **no** tiene acceso al feedback de otras personas ni puede registrar check-ins en KRs ajenos: esas reglas valen para todos los roles.

### 6.1 Gestionar ciclos

**Crear un ciclo**

1. Andá a **Ciclos** y hacé clic en **Crear ciclo**.
2. Completá:
   - **Nombre** (por ejemplo, "OKR 2026" o "Q1 2027").
   - **Tipo**: Anual o Trimestral. Si elegís Trimestral, aparece el campo **Ciclo anual** para indicar a cuál pertenece. Un trimestre debe estar dentro de las fechas de su anual y no puede superponerse con otros trimestres.
   - **Inicio** y **Fin**.
   - **Cadencia de check-in**: Semanal, Quincenal o Mensual.
   - **Umbral de comprometidos** y **Umbral de aspiracionales**: el puntaje mínimo para considerar logrado un objetivo de cada tipo (entre 0 y 1; por defecto 1,00 y 0,70).
3. Hacé clic en **Crear ciclo**. Se crea en estado **Borrador**.

![Crear un ciclo](manual/img/17-crear-ciclo.png)

**Editar, activar y cerrar**

En el detalle del ciclo:

- **Editar**: las fechas solo se pueden cambiar mientras el ciclo es borrador; los umbrales, hasta que se cierre.
- **Activar ciclo**: empieza a regir la cadencia de check-ins y las fechas dejan de poder editarse.
- **Cerrar ciclo**: calcula el puntaje final de los objetivos publicados y los marca como **Logrado** o **No logrado** según los umbrales. **Esta acción no se puede deshacer**: un ciclo cerrado no se puede editar ni reabrir. Los objetivos quedan cerrados y ya no admiten check-ins.

![Detalle de un ciclo con sus umbrales](manual/img/18-detalle-ciclo-admin.png)

### 6.2 Gestionar equipos

**Crear o editar un equipo**

1. En **Equipos**, hacé clic en **Crear equipo** (o, en el detalle de un equipo, en **Editar equipo**).
2. Indicá el **Nombre** y el **Equipo padre** (los equipos forman un árbol; el equipo raíz de la organización no tiene padre).
3. Guardá los cambios.

**Integrantes y liderazgo**

En el detalle del equipo, en **Integrantes**:

- **Agregar integrante**: elegí la persona y, si corresponde, activá **Es líder del equipo**.
- **Hacer líder** / **Quitar liderazgo**: cambia quién lidera.
- **Quitar**: saca a la persona del equipo (pide confirmación).

![Detalle de un equipo visto por administración](manual/img/21-detalle-equipo-admin.png)

### 6.3 Gestionar usuarios

La sección **Usuarios** solo está disponible para administración. Muestra nombre, email, rol y estado de cada persona.

![Lista de usuarios](manual/img/19-usuarios-admin.png)

**Crear un usuario**

1. Hacé clic en **Crear usuario**.
2. Completá **Nombre**, **Email**, **Rol** (Administración, Liderazgo o Integrante) y **Contraseña inicial** (entre 8 y 200 caracteres).
3. Hacé clic en **Crear usuario**. Compartí la contraseña inicial con la persona por un canal seguro.

![Crear un usuario](manual/img/20-crear-usuario.png)

**Editar o desactivar**

Con **Editar** podés cambiar el nombre, el rol y si el usuario está activo (**Usuario activo**). Un usuario desactivado no puede ingresar. No podés cambiar tu propio rol ni desactivarte a vos mismo.

**Restablecer una contraseña**

Con **Contraseña** definís una contraseña nueva para la persona; la anterior deja de funcionar.

### 6.4 Uso de IA

La sección **Uso de IA** (solo administración) muestra cuánto se usa la ayuda de IA y qué impacto tiene. Son **datos agregados**: no se muestran personas ni rankings.

- **Período**: últimos 7, 30 o 90 días.
- **Adopción, tiempo y calidad**: qué proporción de versiones accesibles y sugerencias se aceptan, cuánto tarda una versión y cuánto mejora la legibilidad.
- **Costo (estimado)**: el costo es una **estimación** según una tabla de precios de referencia; el plan gratuito del proveedor no factura.
- **Uso por función y por modelo**: llamadas, tokens, latencia (mediana y percentil 95) y cuántas veces se usó el modelo de respaldo.
- **Fallos por paso**: qué paso falló y por qué.

---

## 7. Preguntas frecuentes

**¿Por qué mi objetivo aparece en rojo si ya cargué check-ins en algunos resultados clave?**
Porque el puntaje del objetivo es el **promedio de todos sus resultados clave**, y los que todavía no tienen check-ins **valen 0** en ese promedio. Ejemplo real de los datos de prueba: un objetivo con tres KRs en 0,15, 0,50 y uno sin check-ins (0) tiene un puntaje de (0,15 + 0,50 + 0) ÷ 3 = **0,22**, es decir **En riesgo**, aunque uno de sus KRs esté en amarillo. Por eso cada objetivo muestra "N de M KRs con check-in": registrá el avance de los KRs que faltan, aunque sea un primer valor.

**¿Por qué un objetivo dice "Sin check-ins" y no tiene color?**
Porque ninguno de sus KRs tiene avances registrados. La plataforma no le asigna banda hasta que haya datos.

**¿Qué significa "Check-in vencido"?**
Que pasó más tiempo que la cadencia del ciclo (por ejemplo, 7 días en un ciclo semanal) desde el último check-in del KR o, si nunca tuvo, desde que se publicó el objetivo. Registrá un check-in para que deje de estar vencido.

**¿Por qué no puedo registrar un check-in?**
El botón está deshabilitado y muestra el motivo. Las causas posibles: el objetivo todavía es **borrador** (hay que publicarlo), el objetivo o el ciclo está **cerrado**, o no sos responsable del KR, del objetivo, integrante del equipo responsable ni su líder.

**No puedo publicar mi objetivo. ¿Qué falta?**
Cada responsable necesita al menos 3 objetivos en el ciclo y cada objetivo al menos 3 resultados clave. Si falta algo, el mensaje te dice qué completar.

**¿Puedo borrar un objetivo publicado o quitarle un KR?**
No. Solo se pueden eliminar objetivos y KRs en borrador.

**¿Quién puede descargar el reporte PDF de un equipo?**
Solo administración y quienes lideran ese equipo. Si sos integrante, o líder de otro equipo, el botón **Descargar reporte PDF** no aparece en el detalle; pedile el reporte a tu líder.

**¿Por qué no puedo cambiar la meta de un KR?**
Después de publicar, el inicio y la meta solo los pueden cambiar el líder o administración. Así se evita mover la vara a mitad de camino.

**¿Quién puede ver mi feedback?**
Solo vos y la otra persona. Ni tu líder ni administración. No aparece en Inicio (solo un contador de "sin leer"), ni en reportes, ni en el PDF.

**¿Por qué no puedo reconocer a alguien por un objetivo o KR?**
Solo se pueden reconocer resultados clave con puntaje de 0,70 o más, u objetivos ya cerrados. Tampoco podés reconocerte a vos mismo.

**¿El puntaje que muestra un reconocimiento es el del momento en que se hizo?**
No, es el puntaje **actual** del resultado clave u objetivo.

**¿Los OKRs influyen en mi sueldo o en bonos?**
No. Los resultados de los OKRs nunca se vinculan con compensaciones.

**Olvidé mi contraseña. ¿Qué hago?**
Pedile a administración que la restablezca desde **Usuarios**.

**¿Hay una pantalla de auditoría para ver quién cambió qué?**
La plataforma registra internamente ciertos cambios (por ejemplo, de umbrales de un ciclo), pero hoy no hay una pantalla para consultarlos desde la interfaz.

---

## 8. Glosario

| Término                            | Definición                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **OKR**                            | _Objectives and Key Results_: un objetivo cualitativo más los resultados clave que lo miden.                    |
| **Objetivo**                       | Lo que se quiere lograr en un ciclo. Pertenece a una persona o a un equipo.                                     |
| **Resultado clave (KR)**           | Medida concreta del avance de un objetivo. Puede ser numérico o manual.                                         |
| **Check-in**                       | Registro periódico del avance de un KR: acción, valor o puntaje y nota.                                         |
| **Puntaje (score)**                | Valor entre 0,00 y 1,00 que indica el avance hacia la meta.                                                     |
| **Banda**                          | Clasificación del puntaje: En ruta (≥ 0,70), Requiere atención (0,40 a 0,69) y En riesgo (< 0,40).              |
| **Sin check-ins**                  | Estado neutro de un KR u objetivo sin avances registrados.                                                      |
| **Check-in vencido**               | KR que superó la cadencia del ciclo sin un check-in.                                                            |
| **Cadencia**                       | Frecuencia esperada de check-ins del ciclo: semanal, quincenal o mensual.                                       |
| **Ciclo**                          | Período en el que se organizan los objetivos: anual o trimestral.                                               |
| **Umbral de logro**                | Puntaje mínimo para que un objetivo se considere logrado al cerrar el ciclo, según su tipo.                     |
| **Comprometido**                   | Objetivo que se espera cumplir por completo (1,00).                                                             |
| **Aspiracional**                   | Objetivo ambicioso; se considera exitoso alrededor de 0,70.                                                     |
| **Top-down**                       | Objetivo que baja desde la dirección.                                                                           |
| **Bottom-up**                      | Objetivo que nace en las personas.                                                                              |
| **Mezcla 50/50**                   | Proporción de objetivos top-down y bottom-up de un equipo en un ciclo; lo ideal es 40 % a 60 % de cada uno.     |
| **Alineación**                     | Vínculo entre un objetivo y otro de nivel superior al que contribuye.                                           |
| **Borrador / Publicado / Cerrado** | Estados de un objetivo (y, con Activo en lugar de Publicado, de un ciclo).                                      |
| **Feedback**                       | Mensaje privado entre dos personas, visible solo para ellas.                                                    |
| **Reconocimiento**                 | Agradecimiento público en el muro por un logro concreto.                                                        |
| **Líder**                          | Persona marcada como líder de un equipo.                                                                        |
| **Versión accesible**              | Adaptación de un texto a lectura fácil o lenguaje claro, generada por IA y marcada hasta que alguien la valida. |
| **Administración**                 | Rol que gestiona ciclos, equipos y usuarios.                                                                    |
