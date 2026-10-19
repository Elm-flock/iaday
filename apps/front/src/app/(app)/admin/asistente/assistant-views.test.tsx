import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './_components/chat-panel';
import { DigestCard } from './_components/digest-card';
import { ExecutionResult, overallStatus } from './_components/execution-result';
import { MessageItem, type ChatMessage } from './_components/message-item';
import { PlanChecklist } from './_components/plan-checklist';
import { QueryResultTable } from './_components/query-result-table';
import type { components } from '@/lib/api/schema';

const actions = vi.hoisted(() => ({
  sendMessageAction: vi.fn(),
  confirmPlanAction: vi.fn(),
  discardPlanAction: vi.fn(),
  clearConversationAction: vi.fn(),
  refreshDigestAction: vi.fn(),
}));
vi.mock('./actions', () => actions);

type Plan = components['schemas']['PlanDto'];
type Step = components['schemas']['StepResultDto'];

const FUTURE = new Date(Date.now() + 10 * 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  status: 'PROPOSED',
  summary: 'Creo el equipo Datos y a Lucía.',
  assumptions: ['Lucía tendrá rol Integrante.'],
  actions: [
    {
      index: 0,
      type: 'CREATE_TEAM',
      description: 'Crear el equipo «Datos» dentro de «Plataforma»',
    },
    { index: 1, type: 'CREATE_USER', description: 'Crear la persona Lucía Gómez (lucia@x.com)' },
  ],
  issues: [],
  warnings: [],
  planHash: 'hash-1',
  expiresAt: FUTURE,
  confirmedAt: null,
  finishedAt: null,
  ...over,
});

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  role: 'ASSISTANT',
  kind: 'TEXT',
  text: 'Hola',
  createdAt: '2026-10-18T18:04:00.000Z',
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe('PlanChecklist', () => {
  it('lista las acciones en orden, los supuestos y los avisos con ícono + palabra', () => {
    render(
      <PlanChecklist
        plan={plan({
          warnings: [{ actionIndex: 1, code: 'CREATES_ADMIN', message: 'Va a ser administrador.' }],
        })}
        busy={false}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Crear el equipo «Datos»/)).toBeInTheDocument();
    expect(screen.getByText('Supuestos que tomé')).toBeInTheDocument();
    expect(screen.getByText('Avisos para tener en cuenta')).toBeInTheDocument();
    expect(screen.getByText(/Crea una persona con acceso de administración:/)).toBeInTheDocument();
    expect(screen.getByText('Esperando tu confirmación')).toBeInTheDocument();
  });

  it('"Confirmar y ejecutar" pasa el plan (con su planHash) y "Descartar" también', async () => {
    const onConfirm = vi.fn();
    const onDiscard = vi.fn();
    const p = plan();
    render(<PlanChecklist plan={p} busy={false} onConfirm={onConfirm} onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y ejecutar' }));
    expect(onConfirm).toHaveBeenCalledWith(p);
    expect(onConfirm.mock.calls[0][0].planHash).toBe('hash-1');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDiscard).toHaveBeenCalledWith(p);
  });

  it('con problemas (INVALID) no se puede confirmar y explica por qué', () => {
    render(
      <PlanChecklist
        plan={plan({
          status: 'INVALID',
          issues: [{ actionIndex: 1, code: 'EMAIL_TAKEN', message: 'Ese email ya existe.' }],
        })}
        busy={false}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('Problemas que impiden ejecutar')).toBeInTheDocument();
    expect(screen.getByText(/Ese email ya existe\. \(paso 2\)/)).toBeInTheDocument();
    expect(screen.getByText('No se puede ejecutar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y ejecutar' })).toBeNull();
  });

  it('con problemas pero estado PROPOSED, el botón queda deshabilitado con explicación', () => {
    render(
      <PlanChecklist
        plan={plan({
          issues: [{ actionIndex: null, code: 'UNGROUNDED', message: 'No lo pediste.' }],
        })}
        busy={false}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Confirmar y ejecutar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/No se puede confirmar mientras haya problemas/);
  });

  it('vencido: deshabilita confirmar y avisa con palabras', async () => {
    render(
      <PlanChecklist
        plan={plan({ expiresAt: PAST })}
        busy={false}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar y ejecutar' })).toBeDisabled(),
    );
    expect(screen.getAllByText(/Venció/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Confirmar y ejecutar' }),
    ).toHaveAccessibleDescription(/El plan venció/);
  });

  it('vigente: muestra la hora de vencimiento y cuánto falta', async () => {
    render(<PlanChecklist plan={plan()} busy={false} onConfirm={vi.fn()} onDiscard={vi.fn()} />);
    expect(await screen.findByText(/en \d+ min/)).toBeInTheDocument();
    expect(screen.getByText(/no se hace ningún cambio/i)).toBeInTheDocument();
  });

  it('ya decidido: sin botones y con el estado en palabras', () => {
    render(
      <PlanChecklist
        plan={plan({ status: 'DISCARDED' })}
        busy={false}
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('Descartado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

const steps = (over: Partial<Step>[] = []): Step[] =>
  [
    {
      index: 0,
      status: 'OK',
      description: 'Crear equipo Datos',
      entity: { type: 'Team', id: 't', url: '/equipos/t' },
    },
    {
      index: 1,
      status: 'OK',
      description: 'Crear persona Lucía',
      entity: { type: 'User', id: 'u', url: '/admin/usuarios' },
      oneTimeSecret: 'Clave-Inicial-9x',
    },
  ].map((s, i) => ({ ...s, ...over[i] }) as Step);

describe('ExecutionResult', () => {
  it('cada paso con ícono y palabra, enlaces a lo creado y la clave una sola vez con aviso', () => {
    render(<ExecutionResult headingId="r1" steps={steps()} />);
    expect(screen.getByRole('heading', { name: 'Se hizo todo lo del plan' })).toBeInTheDocument();
    expect(screen.getAllByText('Hecho.')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Ver lo que se creó' })[0]).toHaveAttribute(
      'href',
      '/equipos/t',
    );
    expect(screen.getByText('Clave-Inicial-9x')).toBeInTheDocument();
    expect(screen.getByText('Se muestra una sola vez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar contraseña' })).toBeInTheDocument();
  });

  it('copiar deja la clave en el portapapeles y avisa', async () => {
    const user = userEvent.setup();
    render(<ExecutionResult headingId="r1" steps={steps()} />);
    await user.click(screen.getByRole('button', { name: 'Copiar contraseña' }));
    expect(await navigator.clipboard.readText()).toBe('Clave-Inicial-9x');
    expect(await screen.findByText('Contraseña copiada al portapapeles.')).toBeInTheDocument();
  });

  it('fallo parcial: OK / Falló / No se hizo, con el motivo y la aclaración de que no se deshace', () => {
    const partial: Step[] = [
      { index: 0, status: 'OK', description: 'Crear equipo Datos' },
      {
        index: 1,
        status: 'FAILED',
        description: 'Crear equipo Ventas',
        error: { code: 'CONFLICT', message: 'Ya existe un equipo con ese nombre.' },
      },
      { index: 2, status: 'SKIPPED', description: 'Crear equipo Soporte' },
    ];
    expect(overallStatus(partial)).toBe('PARTIAL');
    render(<ExecutionResult headingId="r2" steps={partial} />);
    expect(
      screen.getByRole('heading', { name: 'Se hizo solo una parte del plan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hecho.')).toBeInTheDocument();
    expect(screen.getByText('Falló.')).toBeInTheDocument();
    expect(screen.getByText('No se hizo.')).toBeInTheDocument();
    expect(screen.getByText('Ya existe un equipo con ese nombre.')).toBeInTheDocument();
    expect(screen.getByText(/no se deshace solo/)).toBeInTheDocument();
  });

  it('sin oneTimeSecret (historial) no hay bloque de clave', () => {
    render(<ExecutionResult headingId="r3" steps={steps([{}, { oneTimeSecret: undefined }])} />);
    expect(screen.queryByTestId('one-time-secret')).toBeNull();
  });

  it('todo falló: encabezado propio; enlaces externos del back se ignoran', () => {
    const failed: Step[] = [
      {
        index: 0,
        status: 'FAILED',
        description: 'x',
        entity: { type: 'Team', id: 't', url: 'https://evil.com' },
        error: { code: 'X', message: 'Falló algo.' },
      },
    ];
    expect(overallStatus(failed)).toBe('FAILED');
    render(<ExecutionResult headingId="r4" steps={failed} />);
    expect(
      screen.getByRole('heading', { name: 'No se pudo hacer lo del plan' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('QueryResultTable', () => {
  const base = {
    summary: 'Encontré 1 registro.',
    total: 1,
    link: '/admin/auditoria?accion=USER_ROLE_CHANGED',
  };

  it('tabla de auditoría armada con datos del back, con encabezados y enlace a la pantalla completa', () => {
    render(
      <QueryResultTable
        query={{
          ...base,
          type: 'AUDIT_SEARCH',
          requestRows: [],
          auditRows: [
            {
              action: 'USER_ROLE_CHANGED',
              actorName: 'Ana Admin',
              at: '2026-10-18T18:04:00.000Z',
              change: 'Integrante → Líder',
              entityLabel: 'Marta Miembro',
              entityType: 'User',
            },
          ],
        }}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
    expect(within(table).getByText('Rol de una persona cambiado')).toBeInTheDocument();
    expect(within(table).getByText('Integrante → Líder')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en la pantalla completa' })).toHaveAttribute(
      'href',
      '/admin/auditoria?accion=USER_ROLE_CHANGED',
    );
  });

  it('pedidos de adaptación: vencido con palabra; link a pedidos', () => {
    render(
      <QueryResultTable
        query={{
          type: 'ADAPTATION_REQUESTS_LIST',
          summary: 'Hay 1 pedido.',
          total: 1,
          link: '/admin/pedidos-adaptacion?vencidos=1',
          auditRows: [],
          requestRows: [
            {
              assigneeName: null,
              dueDate: '2026-10-01T00:00:00.000Z',
              overdue: true,
              preferredFormat: 'LECTURA_FACIL',
              requesterName: null,
              status: 'PENDIENTE',
              subject: 'Informe',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en la pantalla completa' })).toHaveAttribute(
      'href',
      '/admin/pedidos-adaptacion?vencidos=1',
    );
  });

  it('sin filas: solo el resumen y ningún enlace externo', () => {
    render(
      <QueryResultTable
        query={{
          type: 'AUDIT_SEARCH',
          summary: 'No encontré registros.',
          total: 0,
          link: 'https://evil.com',
          auditRows: [],
          requestRows: [],
        }}
      />,
    );
    expect(screen.getByText('No encontré registros.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('MessageItem', () => {
  const noop = { busyPlanId: null, onConfirm: vi.fn(), onDiscard: vi.fn() };

  it('rotula quién habla con palabras: "Vos" y "Asistente"', () => {
    render(
      <ul>
        <MessageItem message={msg({ id: 'a', role: 'ADMIN', text: 'Creá un equipo' })} {...noop} />
        <MessageItem message={msg({ id: 'b', text: 'Listo' })} {...noop} />
      </ul>,
    );
    const items = screen.getAllByTestId('chat-message');
    expect(within(items[0]).getByText('Vos')).toBeInTheDocument();
    expect(within(items[1]).getByText('Asistente')).toBeInTheDocument();
  });

  it('ayuda: respuesta con citas que enlazan al manual (solo rutas internas)', () => {
    render(
      <ul>
        <MessageItem
          message={msg({
            kind: 'HELP',
            text: '1. Entrá a Ciclos.',
            citations: [
              {
                id: 'admin#cómo-cierro-un-ciclo',
                title: 'Cómo cierro un ciclo',
                url: '/ayuda/admin#cómo-cierro-un-ciclo',
              },
              { id: 'x', title: 'Rota', url: 'https://evil.com' },
            ],
          })}
          {...noop}
        />
      </ul>,
    );
    expect(screen.getByRole('link', { name: 'Cómo cierro un ciclo' })).toHaveAttribute(
      'href',
      '/ayuda/admin#cómo-cierro-un-ciclo',
    );
    expect(screen.queryByRole('link', { name: 'Rota' })).toBeNull();
    expect(screen.getByText('Rota')).toBeInTheDocument();
  });

  it('plan: muestra el checklist; resultado: no repite el texto y muestra los pasos', () => {
    render(
      <ul>
        <MessageItem
          message={msg({ id: 'p', kind: 'PLAN', text: 'Preparé un plan.', plan: plan() })}
          {...noop}
        />
        <MessageItem
          message={msg({ id: 'r', kind: 'EXECUTION_RESULT', text: 'Resumen', steps: steps() })}
          {...noop}
        />
      </ul>,
    );
    expect(screen.getByTestId('plan-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('execution-result')).toBeInTheDocument();
    expect(screen.queryByText('Resumen')).toBeNull();
  });
});

describe('DigestCard', () => {
  const digest = (over: Partial<components['schemas']['DigestDto']> = {}) => ({
    headline: 'Hay temas para revisar hoy.',
    source: 'AI' as const,
    generatedAt: '2026-10-18T18:04:00.000Z',
    chatAvailable: true,
    items: [
      {
        factKey: 'overdueCheckIns',
        count: 7,
        text: 'resultados clave tienen el check-in vencido.',
        href: '/check-ins',
      },
      { factKey: 'teamsWithoutLead', count: 2, text: 'equipos no tienen líder.', href: '/equipos' },
    ],
    ...over,
  });

  it('titular, ítems con cantidad y enlace, y marca de IA con ícono y palabra', () => {
    render(<DigestCard initial={digest()} />);
    expect(screen.getByRole('heading', { name: 'Novedades' })).toBeInTheDocument();
    expect(screen.getByText('Hay temas para revisar hoy.')).toBeInTheDocument();
    expect(screen.getByText('Resumen generado por IA')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Resolver: resultados clave tienen el check-in vencido.' }),
    ).toHaveAttribute('href', '/check-ins');
  });

  it('plantilla: lo dice con palabras', () => {
    render(<DigestCard initial={digest({ source: 'TEMPLATE' })} />);
    expect(screen.getByText('Resumen automático (plantilla)')).toBeInTheDocument();
    expect(screen.queryByText('Resumen generado por IA')).toBeNull();
  });

  it('actualizar pide refresh y reemplaza el contenido', async () => {
    actions.refreshDigestAction.mockResolvedValue({
      ok: true,
      data: digest({ source: 'TEMPLATE', headline: 'Todo está al día.', items: [] }),
    });
    render(<DigestCard initial={digest()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar novedades' }));
    expect(await screen.findByText('Todo está al día.')).toBeInTheDocument();
    expect(screen.getByText('Resumen automático (plantilla)')).toBeInTheDocument();
  });

  it('si actualizar falla, avisa y conserva lo anterior', async () => {
    actions.refreshDigestAction.mockResolvedValue({
      ok: false,
      failure: { kind: 'generic', message: 'Algo salió mal de nuestro lado.' },
    });
    render(<DigestCard initial={digest()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar novedades' }));
    expect(await screen.findByText('Algo salió mal de nuestro lado.')).toBeInTheDocument();
    expect(screen.getByText('Hay temas para revisar hoy.')).toBeInTheDocument();
  });
});

describe('ChatPanel', () => {
  const adminMsg = (text: string) =>
    msg({ id: `a-${text}`, role: 'ADMIN', text, createdAt: '2026-10-18T18:05:00.000Z' });
  const reply = (over: Partial<ChatMessage>) => msg({ id: `r-${Math.random()}`, ...over });

  it('lista vacía: explica qué se puede pedir; el historial es un log con aria-live polite', () => {
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    expect(screen.getByText(/Todavía no hay mensajes/)).toBeInTheDocument();
    const log = screen.getByRole('log', { name: 'Mensajes del asistente' });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('contador de caracteres y Enviar deshabilitado con vacío o más de 2000', async () => {
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    const input = screen.getByLabelText('Qué necesitás');
    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send).toBeDisabled();
    expect(screen.getByText('0 de 2000 caracteres')).toBeInTheDocument();
    await userEvent.type(input, 'Hola');
    expect(screen.getByText('4 de 2000 caracteres')).toBeInTheDocument();
    expect(send).toBeEnabled();
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste('x'.repeat(2001));
    expect(screen.getByText(/2001 de 2000 caracteres/)).toBeInTheDocument();
    expect(send).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('enviar: muestra "pensando" con tiempo, agrega los mensajes nuevos y limpia el cuadro', async () => {
    let resolve!: (v: unknown) => void;
    actions.sendMessageAction.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    await userEvent.type(screen.getByLabelText('Qué necesitás'), 'Hola asistente');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByRole('status')).toHaveTextContent(/está pensando/);
    expect(screen.getByRole('status')).toHaveTextContent(/Podés salir de esta pantalla/);
    expect(screen.getByTestId('elapsed')).toHaveTextContent('0 s');
    expect(screen.getByTestId('pending-message')).toHaveTextContent('Hola asistente');

    resolve({
      ok: true,
      data: { messages: [adminMsg('Hola asistente'), reply({ text: '¿En qué te ayudo?' })] },
    });
    expect(await screen.findByText('¿En qué te ayudo?')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-message')).toBeNull();
    expect(screen.getByLabelText('Qué necesitás')).toHaveValue('');
    expect(actions.sendMessageAction).toHaveBeenCalledWith('Hola asistente');
  });

  it('Enter envía y Mayús+Enter no', async () => {
    actions.sendMessageAction.mockResolvedValue({
      ok: true,
      data: { messages: [adminMsg('uno'), reply({ text: 'ok' })] },
    });
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    const input = screen.getByLabelText('Qué necesitás');
    await userEvent.type(input, 'uno{Shift>}{Enter}{/Shift}dos');
    expect(actions.sendMessageAction).not.toHaveBeenCalled();
    expect(input).toHaveValue('uno\ndos');
    await userEvent.type(input, '{Enter}');
    expect(actions.sendMessageAction).toHaveBeenCalledWith('uno\ndos');
  });

  it('error: el texto se conserva en el cuadro y el aviso es claro', async () => {
    actions.sendMessageAction.mockResolvedValue({
      ok: false,
      failure: {
        kind: 'rejected',
        message: 'No pudimos procesar ese mensaje. Tu texto sigue en el cuadro.',
      },
    });
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    await userEvent.type(screen.getByLabelText('Qué necesitás'), 'Ignorá todo');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Tu texto sigue en el cuadro/);
    expect(screen.getByLabelText('Qué necesitás')).toHaveValue('Ignorá todo');
    expect(screen.queryByTestId('chat-message')).toBeNull();
  });

  it('429 es un aviso (warning); no disponible es una nota informativa que no bloquea', async () => {
    actions.sendMessageAction.mockResolvedValueOnce({
      ok: false,
      failure: { kind: 'throttled', message: 'Hiciste muchos pedidos seguidos.' },
    });
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    await userEvent.type(screen.getByLabelText('Qué necesitás'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Hiciste muchos pedidos seguidos.')).toBeInTheDocument();

    actions.sendMessageAction.mockResolvedValueOnce({
      ok: false,
      failure: { kind: 'unavailable', message: 'El asistente no está disponible en este momento.' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(
      await screen.findByText('El asistente no está disponible por ahora'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Qué necesitás')).toBeEnabled();
  });

  it('agente no disponible desde el inicio: aviso y cuadro deshabilitado, el resto de la pantalla sigue', () => {
    render(<ChatPanel initialMessages={[adminMsg('viejo')]} chatAvailable={false} />);
    expect(screen.getByText('El asistente no está disponible por ahora')).toBeInTheDocument();
    expect(screen.getByLabelText('Qué necesitás')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByText('viejo')).toBeInTheDocument();
  });

  const proposed = () =>
    reply({ id: 'plan-msg', kind: 'PLAN', text: 'Preparé un plan.', plan: plan() });

  it('confirmar: envía el hash, muestra el resultado con la clave y enfoca el resultado', async () => {
    actions.confirmPlanAction.mockResolvedValue({
      ok: true,
      data: {
        planId: 'p1',
        status: 'EXECUTED',
        plan: plan({ status: 'EXECUTED' }),
        steps: steps(),
      },
    });
    render(<ChatPanel initialMessages={[proposed()]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y ejecutar' }));
    expect(actions.confirmPlanAction).toHaveBeenCalledWith('p1', 'hash-1');
    expect(await screen.findByText('Clave-Inicial-9x')).toBeInTheDocument();
    expect(screen.getByText('Ejecutado')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Se hizo todo lo del plan' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Confirmar y ejecutar' })).toBeNull();
  });

  it('la clave inicial NO vuelve desde el historial: al montar de nuevo con el historial del back no está', async () => {
    actions.confirmPlanAction.mockResolvedValue({
      ok: true,
      data: {
        planId: 'p1',
        status: 'EXECUTED',
        plan: plan({ status: 'EXECUTED' }),
        steps: steps(),
      },
    });
    const first = render(<ChatPanel initialMessages={[proposed()]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y ejecutar' }));
    expect(await screen.findByText('Clave-Inicial-9x')).toBeInTheDocument();
    first.unmount();

    // "Recargar": el back devuelve el plan ejecutado y un resultado SIN oneTimeSecret.
    const history: ChatMessage[] = [
      reply({ kind: 'PLAN', text: 'Preparé un plan.', plan: plan({ status: 'EXECUTED' }) }),
      reply({
        kind: 'EXECUTION_RESULT',
        text: 'Se hizo todo.',
        steps: steps([{}, { oneTimeSecret: undefined }]),
      }),
    ];
    render(<ChatPanel initialMessages={history} chatAvailable />);
    expect(screen.getByTestId('execution-result')).toBeInTheDocument();
    expect(screen.queryByText('Clave-Inicial-9x')).toBeNull();
    expect(screen.queryByTestId('one-time-secret')).toBeNull();
  });

  it('plan vencido al confirmar (410): el plan pasa a "Venció" y no queda botón', async () => {
    actions.confirmPlanAction.mockResolvedValue({
      ok: false,
      failure: {
        kind: 'expired',
        message: 'El plan venció (duran 15 minutos) y no se ejecutó nada.',
      },
    });
    render(<ChatPanel initialMessages={[proposed()]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y ejecutar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/El plan venció/);
    expect(screen.getAllByText('Venció').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Confirmar y ejecutar' })).toBeNull();
  });

  it('hash distinto (409): avisa que no se ejecutó nada', async () => {
    actions.confirmPlanAction.mockResolvedValue({
      ok: false,
      failure: {
        kind: 'hash-mismatch',
        message: 'El plan cambió desde que lo viste, así que no se ejecutó nada.',
      },
    });
    render(<ChatPanel initialMessages={[proposed()]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y ejecutar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se ejecutó nada/);
  });

  it('ya decidido (409): muestra cómo quedó, con sus pasos', async () => {
    actions.confirmPlanAction.mockResolvedValue({
      ok: false,
      failure: { kind: 'already-decided', message: 'Este plan ya se había confirmado.' },
      plan: plan({ status: 'EXECUTED', steps: steps([{}, { oneTimeSecret: undefined }]) }),
    });
    render(<ChatPanel initialMessages={[proposed()]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y ejecutar' }));
    expect(await screen.findByText('Este plan ya se había confirmado.')).toBeInTheDocument();
    expect(screen.getByText('Ejecutado')).toBeInTheDocument();
    expect(screen.getByTestId('execution-result')).toBeInTheDocument();
    expect(screen.queryByTestId('one-time-secret')).toBeNull();
  });

  it('descartar: el plan queda "Descartado" y se avisa que no se cambió nada', async () => {
    actions.discardPlanAction.mockResolvedValue({ ok: true, data: plan({ status: 'DISCARDED' }) });
    render(<ChatPanel initialMessages={[proposed()]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(actions.discardPlanAction).toHaveBeenCalledWith('p1');
    expect(await screen.findByText('Descartado')).toBeInTheDocument();
    expect(screen.getByText('Descartaste el plan. No se hizo ningún cambio.')).toBeInTheDocument();
  });

  it('borrar conversación pide confirmación, cancelar no borra, confirmar vacía la lista', async () => {
    actions.clearConversationAction.mockResolvedValue({ ok: true, data: true });
    render(<ChatPanel initialMessages={[adminMsg('hola')]} chatAvailable />);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar conversación' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('¿Borrar la conversación?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(actions.clearConversationAction).not.toHaveBeenCalled();
    expect(screen.getByText('hola')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Borrar conversación' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Borrar conversación' }),
    );
    await waitFor(() => expect(actions.clearConversationAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Borramos la conversación.')).toBeInTheDocument();
    expect(screen.queryByText('hola')).toBeNull();
  });

  it('tras enviar con respuesta de plan, el foco va al plan (para llegar al botón con teclado)', async () => {
    actions.sendMessageAction.mockResolvedValue({
      ok: true,
      data: { messages: [adminMsg('Creá el equipo Datos'), proposed()] },
    });
    render(<ChatPanel initialMessages={[]} chatAvailable />);
    await userEvent.type(screen.getByLabelText('Qué necesitás'), 'Creá el equipo Datos');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    const heading = await screen.findByRole('heading', { name: /Plan propuesto/ });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});
