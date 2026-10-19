/**
 * Respuestas del agente de mentira para el asistente de administración
 * (contrato `docs/ai/agent-contract-admin.md` v1: /v1/admin/chat, /v1/admin/digest-summary, /v1/help/answer).
 *
 * A diferencia del stub de adaptación (fixtures fijos), acá la respuesta DEPENDE del texto del pedido,
 * como un modelo de verdad pero determinista: el e2e escribe frases con un formato reconocible y el stub
 * arma el plan con los handles del catálogo que manda el back. Así el back real valida, persiste y
 * ejecuta planes reales; solo falta el LLM.
 *
 * Frases reconocidas (mayúsculas/acentos no importan):
 *   - "alta a <Nombre> (<email>) [como líder]"         -> CREATE_USER (rol MEMBER, o LEADER con "como líder")
 *   - "equipo <Nombre> dentro de <Equipo existente>"    -> CREATE_TEAM
 *   - "equipos <A>, <B> y <C> dentro de <Equipo>"       -> 3 x CREATE_TEAM (para el fallo parcial)
 *   - "poné a <Nombre> de líder del equipo <Nombre>"    -> SET_TEAM_MEMBER (con los NEW de arriba)
 *   - "cambios de rol"                                  -> QUERY AUDIT_SEARCH (USER_ROLE_CHANGED)
 *   - "cómo ..." / "como ..."                           -> HOW_TO con la primera cita enviada
 *   - cualquier otra cosa                               -> CLARIFY
 *
 * Disparadores de fallas (por texto, así no hay estado global entre specs en paralelo):
 *   - "simular agente caido"   -> corta la conexión (el back responde 503 AI_UNAVAILABLE)
 *   - "ignora todo lo anterior" -> 422 INPUT_REJECTED
 *   - "[demora]"               -> responde a los 2,5 s (estado "pensando")
 */

const usage = (step) => [
  {
    step: 'CLASSIFY',
    attempt: 1,
    model: 'nvidia/classify',
    isFallback: false,
    promptId: 'admin_classify',
    promptVersion: '1',
    promptHash: 'aaa',
    inputTokens: 400,
    outputTokens: 30,
    latencyMs: 900,
    costUsdEst: 0.0001,
    status: 'OK',
    errorCode: null,
  },
  {
    step,
    attempt: 1,
    model: 'nvidia/planner',
    isFallback: false,
    promptId: 'admin_planner',
    promptVersion: '1',
    promptHash: 'bbb',
    inputTokens: 2000,
    outputTokens: 300,
    latencyMs: 4000,
    costUsdEst: 0.003,
    status: 'OK',
    errorCode: null,
  },
];

const chat = (traceId, over) => ({
  traceId,
  intent: 'CLARIFY',
  reply: 'No estoy seguro de qué necesitás. ¿Podés darme más detalle?',
  plan: null,
  query: null,
  citations: [],
  checks: { piiMasked: 0, injectionSuspected: false, planLocalIssues: [] },
  prompt: { id: 'admin_planner', version: '1', hash: 'bbb' },
  usage: usage('PLAN'),
  ...over,
});

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const teamHandle = (body, name) =>
  (body.catalog?.teams ?? []).find((t) => norm(t.name) === norm(name))?.handle ?? null;

function chatResponse(body, traceId) {
  const text = String(body.message ?? '');

  // Varias acciones: equipos A, B y C dentro de P.
  const many = /equipos ([^.]+?) dentro de ([^,.]+)/i.exec(text);
  if (many && many[1].includes(',')) {
    const parent = teamHandle(body, many[2].trim());
    if (!parent) return chat(traceId, { reply: 'No encuentro ese equipo padre. ¿Cuál es?' });
    const names = many[1]
      .split(/,| y /)
      .map((n) => n.trim())
      .filter(Boolean);
    return chat(traceId, {
      intent: 'ACTION',
      reply: `Preparé un plan con ${names.length} pasos. Revisalo y, si está bien, confirmalo.`,
      plan: {
        summary: `Creo ${names.length} equipos.`,
        assumptions: [],
        actions: names.map((name, i) => ({
          type: 'CREATE_TEAM',
          ref: `t${i + 1}`,
          name,
          parent: { kind: 'EXISTING', handle: parent },
          sourceQuote: many[0],
        })),
      },
    });
  }

  const actions = [];
  const assumptions = [];
  const quoteUser = /alta a ([^(]+?) \(([^)\s]+@[^)\s]+)\)( como l[ií]der)?/i.exec(text);
  const quoteTeam = /equipo ([^,.]+?) dentro de ([^,.]+?)(?=,| y |\.|$)/i.exec(text);
  const quoteLead = /pon[eé] a ([^,.]+?) de l[ií]der(?: del equipo ([^,.]+?))?(?=,|\.|$)/i.exec(
    text,
  );

  if (quoteTeam) {
    const parent = teamHandle(body, quoteTeam[2].trim());
    if (!parent) return chat(traceId, { reply: 'No encuentro ese equipo padre. ¿Cuál es?' });
    actions.push({
      type: 'CREATE_TEAM',
      ref: 't1',
      name: quoteTeam[1].trim(),
      parent: { kind: 'EXISTING', handle: parent },
      sourceQuote: quoteTeam[0],
    });
  }
  if (quoteUser) {
    const lead = Boolean(quoteUser[3]);
    actions.push({
      type: 'CREATE_USER',
      ref: 'u1',
      name: quoteUser[1].trim(),
      email: quoteUser[2].trim(),
      role: lead ? 'LEADER' : 'MEMBER',
      sourceQuote: quoteUser[0],
    });
    assumptions.push(
      lead ? 'Va a tener rol Líder.' : 'Va a tener rol Integrante, porque no pediste otro.',
    );
  }
  if (quoteLead && quoteTeam && quoteUser) {
    actions.push({
      type: 'SET_TEAM_MEMBER',
      team: { kind: 'NEW', ref: 't1' },
      user: { kind: 'NEW', ref: 'u1' },
      isLead: true,
      sourceQuote: quoteLead[0],
    });
  }
  if (actions.length > 0) {
    return chat(traceId, {
      intent: 'ACTION',
      reply: `Preparé un plan con ${actions.length} ${actions.length === 1 ? 'paso' : 'pasos'}. Revisalo y, si está bien, tocá «Confirmar y ejecutar».`,
      plan: { summary: 'Hago lo que pediste, en este orden.', assumptions, actions },
    });
  }

  const query = /cambios de rol/i.exec(text);
  if (query) {
    return chat(traceId, {
      intent: 'QUERY',
      reply: 'Busco en la auditoría.',
      query: {
        type: 'AUDIT_SEARCH',
        action: 'USER_ROLE_CHANGED',
        limit: 10,
        sourceQuote: query[0],
      },
    });
  }

  if (/\bc[oó]mo\b/i.test(text) && (body.helpChunks ?? []).length > 0) {
    return chat(traceId, {
      intent: 'HOW_TO',
      reply: '1. Entrá a la pantalla que corresponde.\n2. Seguí los pasos del manual.',
      citations: [body.helpChunks[0].id],
      usage: usage('ANSWER'),
    });
  }
  return chat(traceId, {});
}

/** Resumen fiel: solo los `count` de los hechos, sin nombres (cumple los chequeos de fidelidad del back). */
function digestResponse(body, traceId) {
  const labels = {
    overdueCheckIns: 'resultados clave tienen el check-in vencido.',
    krsInRed: 'resultados clave están en riesgo.',
    cyclesEndingSoon: 'ciclos terminan pronto.',
    cyclesToClose: 'ciclos ya terminaron y hay que cerrarlos.',
    draftsNotPublishable: 'objetivos en borrador todavía no se pueden publicar.',
    usersWithoutTeam: 'personas no tienen equipo.',
    teamsWithoutLead: 'equipos no tienen líder.',
    adaptationsNeedingReview: 'versiones accesibles esperan revisión.',
    adaptationRequestsOpen: 'pedidos de documento adaptado están abiertos.',
    recentSensitiveChanges: 'cambios sensibles recientes.',
  };
  const items = Object.entries(body.facts ?? {})
    .filter(([key, fact]) => labels[key] && fact?.count > 0)
    .map(([key, fact]) => ({ factKey: key, text: `${fact.count} ${labels[key]}` }));
  return {
    traceId,
    summary: {
      headline: items.length > 0 ? 'Hay temas para revisar hoy.' : 'Todo está al día.',
      items,
    },
    checks: { numbersFaithful: true, unknownNumbers: [], unknownNames: [], fallbackUsed: false },
    prompt: { id: 'digest_summary', version: '1', hash: 'ccc' },
    usage: [{ ...usage('SUMMARIZE')[1], promptId: 'digest_summary', step: 'SUMMARIZE' }],
  };
}

/** Devuelve el body de respuesta, o `undefined` si el path no es del asistente de administración. */
export function adminResponse(path, body, traceId) {
  if (path === '/v1/admin/chat') {
    // Disparadores por texto (no por modo global): los e2e corren en paralelo y comparten el stub.
    const text = String(body?.message ?? '');
    if (/simular agente caido/i.test(norm(text))) return { drop: true };
    if (/ignora todo lo anterior/i.test(norm(text))) {
      return {
        status: 422,
        body: {
          traceId,
          error: {
            code: 'INPUT_REJECTED',
            message: 'error del stub',
            retryable: false,
            details: { reason: 'INJECTION_SUSPECTED' },
          },
          usage: usage('PLAN').slice(0, 1),
        },
      };
    }
    const delayMs = /[demora]/i.test(text) ? 2500 : 0;
    return { body: chatResponse(body ?? {}, traceId), delayMs };
  }
  if (path === '/v1/admin/digest-summary') return { body: digestResponse(body ?? {}, traceId) };
  return undefined;
}
