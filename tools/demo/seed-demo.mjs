// Carga de datos DEMO vÃ­a la API real (Node 22, fetch nativo, sin dependencias).
// Uso: node seed-demo.mjs   (env opcionales: API_URL, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD)
import { execFileSync } from 'node:child_process';

const API = process.env.API_URL ?? 'http://127.0.0.1:3100';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@flockit.com.ar';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'DemoFlock2026';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoFlock2026';

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function login(email, password = PASSWORD) {
  const s = await call(null, 'POST', '/auth/login', { email, password });
  return s.accessToken;
}

const log = (m) => console.log(`[demo] ${m}`);

// ---------- Datos ----------
const PEOPLE = [
  { key: 'laura', name: 'Laura GÃ³mez', email: 'laura.gomez@flockit.com.ar', role: 'LEADER' },
  { key: 'martin', name: 'MartÃ­n Ruiz', email: 'martin.ruiz@flockit.com.ar', role: 'MEMBER' },
  { key: 'sofia', name: 'SofÃ­a Pereyra', email: 'sofia.pereyra@flockit.com.ar', role: 'MEMBER' },
  { key: 'diego', name: 'Diego FernÃ¡ndez', email: 'diego.fernandez@flockit.com.ar', role: 'MEMBER' },
  { key: 'valentina', name: 'Valentina RÃ­os', email: 'valentina.rios@flockit.com.ar', role: 'LEADER' },
];

// KR numÃ©rico: [titulo, inicio, meta, unidad, responsable, checkins?]
// KR manual:   ['M', titulo, responsable, checkins?]
// checkins: array de [fraccion de avance (o score 0..1 si es manual), accion, nota, flag?]
const ANNUAL = [
  {
    key: 'A1', type: 'ASPIRATIONAL', origin: 'TOP_DOWN',
    title: 'Convertirnos en la plataforma de referencia para equipos comerciales de la regiÃ³n',
    description: 'Queremos que cuando un equipo comercial busque ordenar su gestiÃ³n, piense primero en nosotros.',
    krs: [
      ['Llegar a 120 clientes activos', 40, 120, 'clientes'],
      ['Alcanzar un NPS de 60', 35, 60, 'puntos'],
      ['M', 'Lanzar la versiÃ³n 2.0 en los 3 mercados objetivo'],
    ],
  },
  {
    key: 'A2', type: 'COMMITTED', origin: 'TOP_DOWN',
    title: 'Construir una operaciÃ³n comercial predecible y rentable',
    description: 'Ingresos recurrentes estables y un ciclo de venta que podamos proyectar con confianza.',
    krs: [
      ['Alcanzar USD 80000 de ingresos recurrentes mensuales', 45000, 80000, 'USD'],
      ['Reducir el churn mensual de 8 a 3', 8, 3, '%'],
      ['Acortar el ciclo de venta de 60 a 35', 60, 35, 'dÃ­as'],
    ],
  },
  {
    key: 'A3', type: 'COMMITTED', origin: 'BOTTOM_UP',
    title: 'Ser un lugar donde da gusto trabajar y crecer',
    description: 'Un equipo que aprende, se cuida y se queda.',
    krs: [
      ['Subir el eNPS de 20 a 50', 20, 50, 'puntos'],
      ['Bajar la rotaciÃ³n anual de 18 a 8', 18, 8, '%'],
      ['M', 'Implementar el programa de mentoring en todas las Ã¡reas'],
    ],
  },
];

// owner: persona (key) o 'team:pd' / 'team:com'. Los check-ins los hace el responsable del KR.
const OBJECTIVES = [
  // ---- Equipo Producto Digital (Laura) ----
  {
    key: 'P1', owner: 'team:pd', type: 'ASPIRATIONAL', origin: 'TOP_DOWN', parent: 'A1',
    title: 'Entregar una experiencia de producto que enamore a nuestros clientes',
    description: 'Que usar la plataforma sea rÃ¡pido, claro y hasta un poco placentero.',
    krs: [
      ['Subir la satisfacciÃ³n (CSAT) de 72 a 90', 72, 90, '%', 'laura', [[0.5, 'UPDATE', 'Arrancamos la encuesta in-app, primeros resultados alentadores.'], [0.67, 'CONTINUE', 'Seguimos la misma lÃ­nea, sin sorpresas.']]],
      ['Reducir el tiempo de carga de la home de 4.2 a 1.5', 4.2, 1.5, 'segundos', 'martin', [[0.85, 'CONTINUE', 'Con el lazy loading y las imÃ¡genes optimizadas ya estamos en 1.9 s.']]],
      ['Lanzar 4 funcionalidades del roadmap', 0, 4, 'funcionalidades', 'sofia', [[0.25, 'START', 'SaliÃ³ la primera; empecemos a ordenar la segunda con ventas.']]],
    ],
  },
  {
    key: 'P2', owner: 'team:pd', type: 'COMMITTED', origin: 'TOP_DOWN', parent: 'A1',
    title: 'Tener una plataforma estable en la que podamos confiar',
    description: 'Menos incendios y mÃ¡s previsibilidad para el equipo y para los clientes.',
    krs: [
      ['Bajar los incidentes crÃ­ticos de 9 a 2 por mes', 9, 2, 'incidentes', 'laura', [[0.3, 'UPDATE', 'Bajamos de 9 a 7, pero todavÃ­a falta mucho. Hay que parar con los hotfixes.']]],
      ['Subir la cobertura de tests de 45 a 80', 45, 80, '%', 'martin', [[0.75, 'CONTINUE', 'Cubrimos los mÃ³dulos de facturaciÃ³n y alineaciÃ³n; vamos bien.']]],
      ['Reducir el tiempo de recuperaciÃ³n ante caÃ­das de 240 a 30', 240, 30, 'minutos', 'laura', null],
    ],
  },
  {
    key: 'P3', owner: 'team:pd', type: 'ASPIRATIONAL', origin: 'BOTTOM_UP',
    title: 'Aprender de nuestros usuarios antes de construir',
    description: 'Decidir con evidencia y no con intuiciÃ³n.',
    krs: [
      ['Hacer 30 entrevistas con usuarios', 0, 30, 'entrevistas', 'sofia', [[0.1, 'START', 'Solo hicimos 3 entrevistas, cuesta coordinar agendas. Probemos con incentivos.']]],
      ['Subir la adopciÃ³n de las funcionalidades nuevas de 10 a 40', 10, 40, '%', 'laura', null],
      ['M', 'Documentar el proceso de discovery del equipo', 'laura', null],
    ],
  },
  // ---- Equipo Comercial (Valentina) ----
  {
    key: 'C1', owner: 'team:com', type: 'ASPIRATIONAL', origin: 'TOP_DOWN', parent: 'A1',
    title: 'Crecer la base de clientes con cuentas de alto valor',
    description: 'Menos volumen por volumen y mÃ¡s cuentas que crezcan con nosotros.',
    krs: [
      ['Llegar a 75 clientes activos', 40, 75, 'clientes', 'valentina', [[0.55, 'UPDATE', 'Cerramos 4 cuentas mÃ¡s esta semana, vamos por buen camino.']]],
      ['Armar un pipeline calificado de USD 400000', 0, 400000, 'USD', 'diego', [[0.8, 'CONTINUE', 'El pipeline supera los 320 mil, hay que cuidar la calidad de las oportunidades.']]],
      ['Publicar 5 casos de Ã©xito', 0, 5, 'casos', 'valentina', null],
    ],
  },
  {
    key: 'C2', owner: 'team:com', type: 'COMMITTED', origin: 'TOP_DOWN', parent: 'A2',
    title: 'Cerrar ventas mÃ¡s rÃ¡pido y con mejor calidad',
    description: 'Un proceso de venta claro, medible y sin descuentos de desesperaciÃ³n.',
    krs: [
      ['Acortar el ciclo de venta de 60 a 35', 60, 35, 'dÃ­as', 'valentina', [[0.2, 'START', 'ReciÃ©n estamos midiendo etapas; el cuello de botella estÃ¡ en la legal.']]],
      ['Subir la tasa de cierre de 18 a 28', 18, 28, '%', 'diego', [[0.35, 'UPDATE', 'MejorÃ³ un poco, pero todavÃ­a perdemos demasiadas en la etapa de demo.']]],
      ['Bajar el descuento promedio de 15 a 8', 15, 8, '%', 'valentina', null],
    ],
  },
  {
    key: 'C3', owner: 'team:com', type: 'COMMITTED', origin: 'BOTTOM_UP', parent: 'A2',
    title: 'Que nuestros clientes se queden y recomienden',
    description: 'La mejor venta es la del cliente que nos recomienda.',
    krs: [
      ['Reducir el churn de 8 a 3', 8, 3, '%', 'valentina', [[0.1, 'STOP', 'Dejamos de ofrecer descuentos de retenciÃ³n sin plan de uso; no estaba funcionando.']]],
      ['Subir el NPS de clientes de 35 a 55', 35, 55, 'puntos', 'diego', null],
      ['M', 'Lanzar el programa de referidos', 'valentina', [[0.4, 'UPDATE', 'Tenemos el diseÃ±o del programa; falta definir el beneficio.']]],
    ],
  },
  // ---- MartÃ­n ----
  {
    key: 'M1', owner: 'martin', type: 'ASPIRATIONAL', origin: 'BOTTOM_UP', parent: 'P1',
    title: 'Hacer que la app vuele en cualquier dispositivo',
    description: 'Rendimiento percibido como una ventaja competitiva.',
    krs: [
      ['Subir el puntaje de Lighthouse de 52 a 90', 52, 90, 'puntos', 'martin', [[0.4, 'UPDATE', 'Pasamos de 52 a 67 con code splitting.'], [0.87, 'CONTINUE', 'Llegamos a 85; solo queda ajustar fuentes y CLS.']]],
      ['Reducir el bundle principal de 2400 a 1200', 2400, 1200, 'KB', 'martin', [[0.6, 'CONTINUE', 'Sacamos dos librerÃ­as pesadas, ahora estamos en 1680 KB.']]],
      ['Bajar el LCP en mÃ³viles de 4.2 a 2.0', 4.2, 2.0, 'segundos', 'martin', [[0.95, 'CONTINUE', 'LCP en 2.1 s en el 75% de las sesiones.']]],
    ],
  },
  {
    key: 'M2', owner: 'martin', type: 'COMMITTED', origin: 'TOP_DOWN', parent: 'P2',
    title: 'Dejar el cÃ³digo de la plataforma mÃ¡s sano',
    description: 'Pagar la deuda tÃ©cnica que mÃ¡s frena al equipo.',
    krs: [
      ['Subir la cobertura de tests de 45 a 80', 45, 80, '%', 'martin', [[0.3, 'UPDATE', 'AÃºn estamos en 55%; priorizamos lo crÃ­tico.']]],
      ['Migrar 12 mÃ³dulos al nuevo esquema de componentes', 0, 12, 'mÃ³dulos', 'martin', [[0.25, 'START', 'Migramos 3; falta acordar el criterio para los mÃ³dulos legacy.']]],
      ['M', 'Publicar la guÃ­a de arquitectura del frontend', 'martin', [[0.2, 'START', 'Tenemos el Ã­ndice y el primer borrador.']]],
    ],
  },
  {
    key: 'M3', owner: 'martin', type: 'ASPIRATIONAL', origin: 'BOTTOM_UP',
    title: 'Crecer como referente tÃ©cnico del equipo',
    description: 'Compartir lo que sÃ© y ayudar a que el resto crezca.',
    krs: [
      ['Dar 3 charlas tÃ©cnicas internas', 0, 3, 'charlas', 'martin', null],
      ['Reducir el tiempo medio de code review de 48 a 12', 48, 12, 'horas', 'martin', [[0.55, 'UPDATE', 'Bajamos a 28 horas con las revisiones acordadas a media maÃ±ana.']]],
      ['M', 'Completar la certificaciÃ³n de arquitectura frontend', 'martin', null],
    ],
  },
  // ---- SofÃ­a ----
  {
    key: 'S1', owner: 'sofia', type: 'ASPIRATIONAL', origin: 'BOTTOM_UP', parent: 'P3',
    title: 'Entender de verdad a quienes usan el producto',
    description: 'Que cada decisiÃ³n de diseÃ±o tenga una voz de usuario detrÃ¡s.',
    krs: [
      ['Realizar 20 entrevistas de descubrimiento', 0, 20, 'entrevistas', 'sofia', [[0.15, 'START', 'Hicimos 3, necesitamos acelerar el reclutamiento.']]],
      ['Sintetizar 10 insights accionables', 0, 10, 'insights', 'sofia', null],
      ['M', 'Validar el prototipo del nuevo tablero con 5 usuarios', 'sofia', [[0.5, 'UPDATE', 'Validamos con 2 de 5, el resto la semana que viene.']]],
    ],
  },
  {
    key: 'S2', owner: 'sofia', type: 'COMMITTED', origin: 'TOP_DOWN', parent: 'P1',
    title: 'Simplificar el onboarding de los clientes nuevos',
    description: 'Que en la primera semana ya vean valor.',
    krs: [
      ['Reducir el tiempo de onboarding de 14 a 5', 14, 5, 'dÃ­as', 'sofia', [[0.9, 'CONTINUE', 'El nuevo flujo guiado ya baja el onboarding a menos de 6 dÃ­as.']]],
      ['Subir la tasa de activaciÃ³n de 35 a 60', 35, 60, '%', 'sofia', [[0.45, 'UPDATE', 'ActivaciÃ³n en 46%; el paso de integraciÃ³n sigue frenando.']]],
      ['Bajar los tickets de soporte de onboarding de 120 a 40', 120, 40, 'tickets', 'sofia', [[0.1, 'STOP', 'Dejamos de enviar el manual en PDF, genera mÃ¡s dudas que respuestas.']]],
    ],
  },
  {
    key: 'S3', owner: 'sofia', type: 'ASPIRATIONAL', origin: 'BOTTOM_UP',
    title: 'Construir un sistema de diseÃ±o que nos haga mÃ¡s rÃ¡pidos',
    description: 'Componentes consistentes y documentados para todo el equipo.',
    krs: [
      ['Documentar 40 componentes', 0, 40, 'componentes', 'sofia', null],
      ['Subir la reutilizaciÃ³n de componentes de 30 a 70', 30, 70, '%', 'sofia', null],
      ['M', 'Lograr que los 2 equipos adopten el sistema de diseÃ±o', 'sofia', null],
    ],
  },
  // ---- Diego ----
  {
    key: 'D1', owner: 'diego', type: 'ASPIRATIONAL', origin: 'TOP_DOWN', parent: 'C1',
    title: 'Abrir cuentas nuevas con propuestas que realmente importen',
    description: 'Llegar a quienes deciden con un mensaje que resuelva su problema.',
    krs: [
      ['Concretar 40 reuniones con decisores', 0, 40, 'reuniones', 'diego', [[0.6, 'CONTINUE', 'Llevamos 24 reuniones; el outbound personalizado funciona mejor.']]],
      ['Sumar 15 clientes nuevos', 0, 15, 'clientes', 'diego', [[0.2, 'START', 'Tenemos 3 cierres, y varios en negociaciÃ³n avanzada.']]],
      ['Generar USD 150000 de pipeline propio', 0, 150000, 'USD', 'diego', null],
    ],
  },
  {
    key: 'D2', owner: 'diego', type: 'COMMITTED', origin: 'BOTTOM_UP', parent: 'C2',
    title: 'Responder rÃ¡pido y acompaÃ±ar mejor a cada prospecto',
    description: 'La velocidad de respuesta como parte de la propuesta de valor.',
    krs: [
      ['Reducir el tiempo de respuesta de 48 a 12', 48, 12, 'horas', 'diego', [[0.4, 'UPDATE', 'Bajamos a 34 horas con las respuestas guardadas.'], [0.89, 'CONTINUE', 'Estamos respondiendo en 16 horas en promedio.']]],
      ['Subir el seguimiento registrado en CRM de 55 a 95', 55, 95, '%', 'diego', [[0.7, 'CONTINUE', 'Llegamos a 83%, falta sumar las llamadas.']]],
      ['M', 'Armar y validar el playbook de primera reuniÃ³n', 'diego', null],
    ],
  },
  {
    key: 'D3', owner: 'diego', type: 'COMMITTED', origin: 'TOP_DOWN', parent: 'C3',
    title: 'Profundizar la relaciÃ³n con los clientes actuales',
    description: 'AcompaÃ±ar a cada cuenta para que crezca y nos recomiende.',
    krs: [
      ['Visitar a 12 clientes clave', 0, 12, 'visitas', 'diego', [[0.5, 'UPDATE', 'Hicimos 6 visitas, todas con buen feedback.', 'overdue']]],
      ['Documentar 3 casos de Ã©xito con clientes', 0, 3, 'casos', 'diego', null],
      ['Bajar el churn de mis cuentas de 10 a 4', 10, 4, '%', 'diego', [[0.15, 'START', 'Identificamos 4 cuentas en riesgo y armamos plan de rescate.']]],
    ],
  },
];

const round = (n) => Math.round(n * 10) / 10;

// ---------- EjecuciÃ³n ----------
const startedAt = Date.now();
const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
log('Login admin OK');

const existing = await call(adminToken, 'GET', '/cycles');
if (existing.length > 0) {
  console.error('[demo] Ya hay ciclos cargados: la DEMO parece estar sembrada. EjecutÃ¡ demo-down.ps1 y volvÃ© a levantar.');
  process.exit(2);
}

const me = await call(adminToken, 'GET', '/auth/me');
const adminId = me.id;

// Usuarios
const users = {};
for (const p of PEOPLE) {
  const u = await call(adminToken, 'POST', '/users', { email: p.email, name: p.name, password: PASSWORD, role: p.role });
  users[p.key] = { ...p, id: u.id };
}
log(`Usuarios creados: ${PEOPLE.length}`);

// Equipos
const tree = await call(adminToken, 'GET', '/teams');
const root = tree[0];
const teamPD = await call(adminToken, 'POST', '/teams', { name: 'Producto Digital', parentId: root.id });
const teamCOM = await call(adminToken, 'POST', '/teams', { name: 'Comercial', parentId: root.id });
const setMember = (team, key, isLead = false) =>
  call(adminToken, 'PUT', `/teams/${team.id}/members/${users[key].id}`, { isLead });
await setMember(teamPD, 'laura', true);
await setMember(teamPD, 'martin');
await setMember(teamPD, 'sofia');
await setMember(teamCOM, 'valentina', true);
await setMember(teamCOM, 'diego');
log(`Equipos creados bajo "${root.name}"`);

// Ciclos
const annual = await call(adminToken, 'POST', '/cycles', {
  name: '2026', kind: 'ANNUAL', startDate: '2026-01-01', endDate: '2026-12-31',
});
await call(adminToken, 'POST', `/cycles/${annual.id}/activate`);
const q4 = await call(adminToken, 'POST', '/cycles', {
  name: 'Q4 2026', kind: 'QUARTER', parentId: annual.id, startDate: '2026-10-01', endDate: '2026-12-31',
  checkInCadence: 'WEEKLY', committedThreshold: 1.0, aspirationalThreshold: 0.7,
});
await call(adminToken, 'POST', `/cycles/${q4.id}/activate`);
log('Ciclos 2026 y Q4 2026 activos');

const tokens = { admin: adminToken };
for (const p of PEOPLE) tokens[p.key] = await login(p.email);

const objs = {}; // key -> { id, krs: [{id, ...}] }

async function createKrs(token, objectiveId, def) {
  const krs = [];
  for (const k of def.krs) {
    let body;
    let meta;
    if (k[0] === 'M') {
      body = { title: k[1], ownerId: users[k[2]].id, scoring: 'MANUAL' };
      meta = { manual: true, ownerKey: k[2], ci: k[3] ?? null };
    } else {
      body = { title: k[0], ownerId: users[k[4]].id, scoring: 'DERIVED', startValue: String(k[1]), targetValue: String(k[2]), unit: k[3] };
      meta = { start: k[1], target: k[2], ownerKey: k[4], ci: k[5] ?? null };
    }
    const created = await call(token, 'POST', `/objectives/${objectiveId}/key-results`, body);
    krs.push({ ...meta, id: created.id });
  }
  return krs;
}

// Anuales (admin, dueÃ±o: equipo raÃ­z)
for (const a of ANNUAL) {
  const o = await call(adminToken, 'POST', '/objectives', {
    cycleId: annual.id, ownerTeamId: root.id, title: a.title, description: a.description, origin: a.origin, type: a.type,
  });
  for (const k of a.krs) {
    await call(adminToken, 'POST', `/objectives/${o.id}/key-results`, k[0] === 'M'
      ? { title: k[1], ownerId: adminId, scoring: 'MANUAL' }
      : { title: k[0], ownerId: adminId, scoring: 'DERIVED', startValue: String(k[1]), targetValue: String(k[2]), unit: k[3] });
  }
  objs[a.key] = { id: o.id };
}
for (const a of ANNUAL) await call(adminToken, 'POST', `/objectives/${objs[a.key].id}/publish`);
log('Objetivos anuales publicados (3)');

// Q4: primero equipos (los individuales se alinean a objetivos PUBLISHED), luego personas.
const ownerCfg = {
  'team:pd': { token: 'laura', body: { ownerTeamId: teamPD.id } },
  'team:com': { token: 'valentina', body: { ownerTeamId: teamCOM.id } },
  martin: { token: 'martin', body: { ownerUserId: users.martin.id } },
  sofia: { token: 'sofia', body: { ownerUserId: users.sofia.id } },
  diego: { token: 'diego', body: { ownerUserId: users.diego.id } },
};
for (const owner of ['team:pd', 'team:com', 'martin', 'sofia', 'diego']) {
  const cfg = ownerCfg[owner];
  const defs = OBJECTIVES.filter((d) => d.owner === owner);
  for (const d of defs) {
    const o = await call(tokens[cfg.token], 'POST', '/objectives', {
      cycleId: q4.id, ...cfg.body, title: d.title, description: d.description, origin: d.origin, type: d.type,
      parentObjectiveId: d.parent ? objs[d.parent].id : undefined,
    });
    objs[d.key] = { id: o.id, krs: await createKrs(tokens[cfg.token], o.id, d) };
  }
  for (const d of defs) await call(tokens[cfg.token], 'POST', `/objectives/${objs[d.key].id}/publish`);
  log(`Objetivos publicados: ${owner} (${defs.length})`);
}

// Check-ins (los hace el responsable del KR)
let checkIns = 0;
const overdueKrs = [];
for (const d of OBJECTIVES) {
  for (const kr of objs[d.key].krs) {
    if (!kr.ci) continue;
    for (const [f, action, note, flag] of kr.ci) {
      const body = kr.manual
        ? { action, note, manualScore: round(f) }
        : { action, note, value: String(round(kr.start + f * (kr.target - kr.start))) };
      await call(tokens[kr.ownerKey], 'POST', `/key-results/${kr.id}/check-ins`, body);
      checkIns++;
      if (flag === 'overdue') overdueKrs.push(kr.id);
    }
  }
}
log(`Check-ins creados: ${checkIns}`);

// Vencidos: la API no permite retrodatar. SQL SOLO contra la DB demo (contenedor okr-demo-db-test-1, puerto 55435).
const psql = (sql) =>
  execFileSync('docker', ['exec', 'okr-demo-db-test-1', 'psql', '-U', 'postgres', '-d', 'okr-platform-test', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
psql(`UPDATE "Objective" SET "publishedAt" = now() - interval '15 days' WHERE id = '${objs.S3.id}';`); // SofÃ­a: 3 KRs sin check-in, vencidos
for (const id of overdueKrs) {
  psql(`UPDATE "CheckIn" SET "createdAt" = now() - interval '12 days' WHERE "keyResultId" = '${id}';`);
  psql(`UPDATE "KeyResult" SET "lastCheckInAt" = now() - interval '12 days' WHERE id = '${id}';`); // Diego: KR con check-in viejo
}
log('KRs vencidos retrodatados en la DB demo (objetivo S3 de SofÃ­a y una visita de Diego)');

// Feedback
const f1 = await call(tokens.laura, 'POST', '/feedback', {
  toUserId: users.martin.id, objectiveId: objs.M1.id,
  content: 'MartÃ­n, el trabajo con el bundle fue excelente. Me gustarÃ­a que compartas con el equipo cÃ³mo lo encaraste; podrÃ­a ser tu primera charla del trimestre.',
});
await call(tokens.laura, 'POST', '/feedback', {
  toUserId: users.sofia.id, objectiveId: objs.S1.id,
  content: 'SofÃ­a, noto que las entrevistas van lento. Â¿QuerÃ©s que veamos juntas cÃ³mo reclutar usuarios con ayuda de Comercial? Creo que Diego puede conectarte con clientes.',
});
const f3 = await call(tokens.valentina, 'POST', '/feedback', {
  toUserId: users.diego.id, objectiveId: objs.D2.id,
  content: 'Diego, bajar el tiempo de respuesta a 16 horas fue un gran avance. Para llegar a 12 probÃ¡ priorizar primero los leads que vienen de referidos.',
});
await call(tokens.valentina, 'PATCH', `/feedback/${f3.id}`, {
  content: 'Diego, bajar el tiempo de respuesta a 16 horas fue un gran avance. Para llegar a 12 probÃ¡ priorizar primero los leads que vienen de referidos y automatizar el primer contacto.',
});
await call(tokens.martin, 'POST', '/feedback', {
  toUserId: users.laura.id,
  content: 'Laura, me sirviÃ³ mucho que me des tiempo protegido para los tests. Si podemos sostenerlo el prÃ³ximo mes, llegamos a la meta de cobertura.',
});
await call(tokens.martin, 'PATCH', `/feedback/${f1.id}/read`);
await call(tokens.diego, 'PATCH', `/feedback/${f3.id}/read`);
log('Feedback: 4 mensajes (1 editado; sin leer: el de SofÃ­a y el de Laura)');

// Reconocimientos (hitos: KR con score >= 0.7)
await call(tokens.laura, 'POST', '/recognitions', {
  toUserId: users.martin.id, keyResultId: objs.M1.krs[2].id,
  message: 'Llevar el LCP mÃ³vil de 4.2 a 2.1 segundos no fue magia: fue constancia y mucho criterio tÃ©cnico. Â¡Gracias, MartÃ­n!',
});
await call(tokens.laura, 'POST', '/recognitions', {
  toUserId: users.sofia.id, keyResultId: objs.S2.krs[0].id,
  message: 'El nuevo onboarding guiado hizo que los clientes vean valor en menos de una semana. Un trabajo impecable, SofÃ­a.',
});
await call(tokens.valentina, 'POST', '/recognitions', {
  toUserId: users.diego.id, keyResultId: objs.D2.krs[0].id,
  message: 'Pasar de 48 a 16 horas de respuesta cambiÃ³ la conversaciÃ³n con los prospectos. Â¡Muy bien, Diego!',
});
log('Reconocimientos: 3');

// Resumen
const pending = {};
for (const p of PEOPLE) pending[p.key] = (await call(tokens[p.key], 'GET', '/check-ins/pending')).length;
const all = await call(adminToken, 'GET', `/objectives?cycleId=${q4.id}`);
const bands = { verde: 0, amarillo: 0, rojo: 0, 'sin check-ins': 0 };
for (const o of all) for (const k of o.keyResults ?? []) {
  const s = Number(k.score);
  const b = !k.hasCheckIns ? 'sin check-ins' : s >= 0.7 ? 'verde' : s >= 0.4 ? 'amarillo' : 'rojo';
  bands[b]++;
}
console.log('\n================ DEMO LISTA ================');
console.log('Ciclos: 2026 (ANNUAL) y Q4 2026 (QUARTER, semanal) ACTIVE');
console.log(`Objetivos anuales: 3 | Objetivos Q4: ${all.length} | check-ins: ${checkIns}`);
console.log(`KRs Q4 por banda: ${JSON.stringify(bands)}`);
console.log(`Check-ins vencidos por persona: ${JSON.stringify(pending)}`);
console.log('Feedback: 4 | Reconocimientos: 3');
console.log(`\nCredenciales (clave de todos los usuarios demo: ${PASSWORD})`);
console.log(`  ADMIN     ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
for (const p of PEOPLE) console.log(`  ${p.role.padEnd(9)} ${p.email}`);
console.log(`\nAPI ${API}  |  Swagger ${API}/api  |  Front http://localhost:3101`);
console.log(`Tiempo: ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
