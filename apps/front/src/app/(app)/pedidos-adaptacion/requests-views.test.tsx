import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyRequestCard } from './_components/my-request-card';
import { RequestForm } from './_components/request-form';
import { RequestsTable } from '../admin/pedidos-adaptacion/_components/requests-table';
import type { AdaptationRequest } from '@/lib/dal/adaptation-requests';

vi.mock('./actions', () => ({ createAdaptationRequestAction: vi.fn() }));
vi.mock('../admin/pedidos-adaptacion/actions', () => ({
  assignRequestAction: vi.fn(),
  deliverRequestAction: vi.fn(),
  rejectRequestAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

const request = (over: Partial<AdaptationRequest> = {}): AdaptationRequest => ({
  id: 'r1',
  requesterId: 'u1',
  requesterName: 'Ana Pérez',
  subject: 'Reporte del ciclo en lectura fácil',
  description: null,
  entityType: null,
  entityId: null,
  preferredFormat: 'LECTURA_FACIL',
  status: 'PENDIENTE',
  assigneeId: null,
  assigneeName: null,
  dueDate: '2026-10-28T12:00:00.000Z',
  overdue: false,
  resolutionNote: null,
  resolutionLink: null,
  rejectionJustification: null,
  resolvedAt: null,
  createdAt: '2026-10-18T12:00:00.000Z',
  updatedAt: '2026-10-18T12:00:00.000Z',
  ...over,
});

describe('MyRequestCard', () => {
  it('pendiente: estado con palabra, fecha límite y explicación', () => {
    render(<MyRequestCard request={request()} />);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('28/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Lectura fácil')).toBeInTheDocument();
    expect(screen.queryByText('Vencido')).not.toBeInTheDocument();
  });

  it('vencido: agrega la palabra "Vencido"', () => {
    render(<MyRequestCard request={request({ overdue: true })} />);
    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  it('entregado: muestra la nota y el enlace (se abre en pestaña nueva, avisado)', () => {
    render(
      <MyRequestCard
        request={request({
          status: 'ENTREGADA',
          assigneeName: 'Admin Flock',
          resolutionNote: 'Te dejamos el reporte en lectura fácil.',
          resolutionLink: 'https://docs.test/reporte',
        })}
      />,
    );
    expect(screen.getByText('Entregada')).toBeInTheDocument();
    expect(screen.getByText('Te dejamos el reporte en lectura fácil.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Abrir el documento adaptado/ });
    expect(link).toHaveAttribute('href', 'https://docs.test/reporte');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByText(/Fecha límite/)).not.toBeInTheDocument();
  });

  it('rechazado: la persona ve la justificación escrita', () => {
    render(
      <MyRequestCard
        request={request({
          status: 'RECHAZADA',
          rejectionJustification: 'Hoy exige un estudio externo que no podemos costear.',
        })}
      />,
    );
    expect(screen.getByText('Rechazada')).toBeInTheDocument();
    expect(screen.getByText('Por qué no pudimos hacerlo')).toBeInTheDocument();
    expect(
      screen.getByText('Hoy exige un estudio externo que no podemos costear.'),
    ).toBeInTheDocument();
  });
});

describe('RequestForm', () => {
  it('todos los formatos del back, y sin vínculo no manda campos ocultos', () => {
    const { container } = render(<RequestForm />);
    const select = screen.getByRole('combobox', { name: /formato/ });
    expect(within(select).getAllByRole('option')).toHaveLength(7);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
  });

  it('con vínculo manda tipo e id; para feedback avisa que administración no lo lee', () => {
    const { container } = render(<RequestForm link={{ type: 'feedback', id: 'f1' }} />);
    expect(container.querySelector('input[name="linkType"]')).toHaveValue('feedback');
    expect(container.querySelector('input[name="linkId"]')).toHaveValue('f1');
    expect(screen.getByText(/Administración no puede leer tu feedback/)).toBeInTheDocument();
  });
});

describe('RequestsTable (administración)', () => {
  const admins = [{ id: 'adm', name: 'Admin Flock' }];

  it('resalta vencidos con ícono + palabra y los marca en el DOM; los de en fecha no', () => {
    render(
      <RequestsTable
        items={[
          request({ id: 'late', overdue: true, subject: 'Atrasado' }),
          request({ id: 'ok', subject: 'En fecha' }),
        ]}
        admins={admins}
        currentUserId="adm"
      />,
    );
    const rows = screen.getAllByTestId('admin-adaptation-request');
    expect(rows[0]).toHaveAttribute('data-overdue', 'true');
    expect(within(rows[0]).getByText('Vencido')).toBeInTheDocument();
    expect(rows[0].querySelector('svg')).not.toBeNull();
    expect(rows[1]).not.toHaveAttribute('data-overdue');
    expect(within(rows[1]).queryByText('Vencido')).not.toBeInTheDocument();
  });

  it('abiertos tienen Asignar / Entregar / Rechazar; los resueltos no tienen acciones', () => {
    render(
      <RequestsTable
        items={[
          request({ id: 'a' }),
          request({
            id: 'b',
            status: 'RECHAZADA',
            rejectionJustification: 'Por la carga desproporcionada que implica.',
          }),
        ]}
        admins={admins}
        currentUserId="adm"
      />,
    );
    const [open, closed] = screen.getAllByTestId('admin-adaptation-request');
    expect(within(open).getByRole('button', { name: 'Asignar' })).toBeInTheDocument();
    expect(within(open).getByRole('button', { name: 'Entregar' })).toBeInTheDocument();
    expect(within(open).getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(within(closed).queryByRole('button')).not.toBeInTheDocument();
    expect(within(closed).getByText(/Justificación: Por la carga/)).toBeInTheDocument();
  });

  it('un feedback vinculado se muestra como privado, sin id', () => {
    render(
      <RequestsTable
        items={[request({ entityType: 'FEEDBACK', entityId: null })]}
        admins={admins}
        currentUserId="adm"
      />,
    );
    expect(screen.getByText(/privado: administración no lo puede leer/)).toBeInTheDocument();
  });

  it('sin pedidos: estado vacío explicado', () => {
    render(<RequestsTable items={[]} admins={admins} currentUserId="adm" />);
    expect(screen.getByText('No hay pedidos con este filtro')).toBeInTheDocument();
  });
});
