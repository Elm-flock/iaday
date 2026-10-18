import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACTIONS } from './audit-diff';
import { AuditFilters } from './_components/audit-filters';
import { AuditPagination, auditHref } from './_components/audit-pagination';
import { AuditTable } from './_components/audit-table';
import type { AuditEntry } from '@/lib/dal/audit';

const people = new Map([['u1', 'Ana Pérez']]);

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'e1',
  actorId: 'u1',
  action: 'OBJECTIVE_PUBLISHED',
  entityType: 'Objective',
  entityId: '6f1c2f0e-3b8d-4a52-9c5e-1d2a3b4c5d6e',
  before: { status: 'DRAFT' },
  after: { status: 'PUBLISHED' },
  createdAt: '2026-10-18T18:04:00.000Z',
  ...over,
});

describe('AuditTable', () => {
  it('muestra fecha, quién, acción en español, elemento y el cambio legible', () => {
    render(<AuditTable items={[entry()]} people={people} />);
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('18/10/2026 · 15:04')).toBeInTheDocument();
    expect(within(row).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(row).getByText('Objetivo publicado')).toBeInTheDocument();
    expect(within(row).getByText('Objetivo')).toBeInTheDocument();
    expect(within(row).getByText('Código 6f1c2f0e')).toBeInTheDocument();
    expect(row).toHaveTextContent('Estado: Borrador');
    expect(row).toHaveTextContent('Publicado');
  });

  it('marca con "Vía asistente" lo que ejecutó el asistente (ícono + palabra)', () => {
    render(
      <AuditTable
        items={[
          entry({
            action: 'ASSISTANT_ACTION_EXECUTED',
            entityType: 'Team',
            before: null,
            after: { via: 'assistant', planId: 'p1', step: 0, actionType: 'CREATE_TEAM' },
          }),
          entry({ id: 'e9' }),
        ]}
        people={people}
      />,
    );
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Acción del asistente ejecutada')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Vía asistente')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Crear equipo');
    expect(within(rows[2]).queryByText('Vía asistente')).toBeNull();
  });

  it('actorId nulo se muestra como "Usuario eliminado"', () => {
    render(<AuditTable items={[entry({ actorId: null })]} people={people} />);
    expect(screen.getByText('Usuario eliminado')).toBeInTheDocument();
  });

  it('acciones de IA y de pedidos con su etiqueta; sin ids técnicos en pantalla', () => {
    render(
      <AuditTable
        items={[
          entry({
            id: 'e2',
            action: 'AI_CONTENT_VALIDATED',
            entityType: 'AdaptedContent',
            before: { status: 'DRAFT' },
            after: { status: 'VALIDATED', humanEdited: true, traceId: 'trace-123' },
          }),
          entry({
            id: 'e3',
            action: 'ADAPTATION_REQUEST_REJECTED',
            entityType: 'AdaptationRequest',
            before: { status: 'EN_CURSO' },
            after: { status: 'RECHAZADA' },
          }),
        ]}
        people={people}
      />,
    );
    expect(screen.getByText('Versión accesible validada por una persona')).toBeInTheDocument();
    expect(screen.getByText('Pedido de documento adaptado rechazado')).toBeInTheDocument();
    expect(screen.queryByText(/trace-123/)).not.toBeInTheDocument();
    expect(screen.getByText('Corregida por una persona:', { exact: false })).toBeInTheDocument();
  });

  it('sin datos útiles lo dice; sin registros muestra un estado vacío explicado', () => {
    const { rerender } = render(
      <AuditTable items={[entry({ before: null, after: { traceId: 'x' } })]} people={people} />,
    );
    expect(screen.getByText('Sin datos para mostrar')).toBeInTheDocument();
    rerender(<AuditTable items={[]} people={people} />);
    expect(screen.getByText('No hay registros con estos filtros')).toBeInTheDocument();
  });

  it('un registro sobre feedback nunca muestra contenido', () => {
    render(
      <AuditTable
        items={[entry({ entityType: 'Feedback', after: { content: 'Tu trabajo fue flojo' } })]}
        people={people}
      />,
    );
    expect(screen.queryByText(/flojo/)).not.toBeInTheDocument();
  });
});

describe('AuditPagination', () => {
  const values = { action: 'KR_SCORE_CHANGED' as const, from: '2026-10-01' };

  it('conserva los filtros en los enlaces y marca los extremos', () => {
    expect(auditHref(values, 1)).toBe('/admin/auditoria?accion=KR_SCORE_CHANGED&desde=2026-10-01');
    expect(auditHref(values, 3)).toBe(
      '/admin/auditoria?accion=KR_SCORE_CHANGED&desde=2026-10-01&pagina=3',
    );

    render(<AuditPagination page={1} limit={20} total={45} values={values} />);
    expect(screen.getByText(/Mostrando 1 a 20 de 45 · Página 1 de 3/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/admin/auditoria?accion=KR_SCORE_CHANGED&desde=2026-10-01&pagina=2',
    );
  });

  it('sin registros', () => {
    render(<AuditPagination page={1} limit={20} total={0} values={{}} />);
    expect(screen.getByText('Sin registros')).toBeInTheDocument();
  });
});

describe('AuditFilters', () => {
  it('ofrece todas las acciones en español, valores elegidos y "Quitar filtros" solo con filtros', () => {
    const { unmount } = render(
      <AuditFilters values={{}} people={[{ id: 'u1', name: 'Ana Pérez' }]} actions={ACTIONS} />,
    );
    const select = screen.getByRole('combobox', { name: 'Acción' });
    expect(within(select).getAllByRole('option')).toHaveLength(ACTIONS.length + 1);
    expect(within(select).getByRole('option', { name: 'Versión accesible generada con IA' }));
    expect(screen.queryByRole('link', { name: 'Quitar filtros' })).not.toBeInTheDocument();

    unmount();
    render(
      <AuditFilters
        values={{ action: 'CYCLE_CLOSED', from: '2026-10-01' }}
        people={[{ id: 'u1', name: 'Ana Pérez' }]}
        actions={ACTIONS}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Acción' })).toHaveValue('CYCLE_CLOSED');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
    expect(screen.getByRole('link', { name: 'Quitar filtros' })).toHaveAttribute(
      'href',
      '/admin/auditoria',
    );
  });
});
