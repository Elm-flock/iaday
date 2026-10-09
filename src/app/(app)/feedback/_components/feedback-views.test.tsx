import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackAuthorActions } from './feedback-author-actions';
import { FeedbackDetailView } from './feedback-detail-view';
import { FeedbackForm } from './feedback-form';
import { FeedbackListView } from './feedback-list-view';
import { FeedbackTabs } from './feedback-tabs';
import { MarkAsRead } from './mark-as-read';
import { PrivacyNotice } from './privacy-notice';
import { ToastProvider } from '@/components/ui/toast';
import type { Feedback } from '@/lib/dal/feedback';

const actions = vi.hoisted(() => ({
  createFeedbackAction: vi.fn(),
  updateFeedbackAction: vi.fn(),
  deleteFeedbackAction: vi.fn(),
  markFeedbackReadAction: vi.fn(),
}));
vi.mock('../actions', () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const fb = (over: Partial<Feedback> = {}): Feedback => ({
  id: 'f1',
  fromUserId: 'ana',
  toUserId: 'beto',
  content: 'Ordenaste la reunión y nos ahorró tiempo.',
  objectiveId: null,
  keyResultId: null,
  readAt: null,
  createdAt: '2026-03-02T15:30:00.000Z',
  updatedAt: '2026-03-02T15:30:00.000Z',
  ...over,
});
const names = new Map([
  ['ana', 'Ana Pérez'],
  ['beto', 'Beto Gómez'],
]);

describe('aviso de privacidad', () => {
  it('dice que solo emisor y receptor pueden ver el feedback', () => {
    render(<PrivacyNotice />);
    expect(screen.getByText('Solo vos y la otra persona pueden ver este feedback.')).toBeVisible();
  });
});

describe('FeedbackListView', () => {
  it('recibido: marca "Sin leer" con ícono + palabra solo en lo no leído', () => {
    render(
      <FeedbackListView
        box="received"
        viewerId="beto"
        names={names}
        items={[fb(), fb({ id: 'f2', readAt: '2026-03-03T10:00:00.000Z' })]}
      />,
    );
    expect(screen.getAllByText('Sin leer')).toHaveLength(1);
    expect(screen.getAllByText(/^De Ana Pérez$/)).toHaveLength(2);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/feedback/f1');
    // dd/mm/aaaa hh:mm en hora de Buenos Aires.
    expect(screen.getAllByText('02/03/2026 12:30').length).toBeGreaterThan(0);
  });

  it('enviado: nunca "Sin leer" para el autor; muestra "Leído" si el receptor lo abrió', () => {
    render(
      <FeedbackListView
        box="sent"
        viewerId="ana"
        names={names}
        items={[fb(), fb({ id: 'f2', readAt: '2026-03-03T10:00:00.000Z' })]}
      />,
    );
    expect(screen.queryByText('Sin leer')).not.toBeInTheDocument();
    expect(screen.getAllByText('Leído')).toHaveLength(1);
    expect(screen.getAllByText('Para Beto Gómez')).toHaveLength(2);
  });

  it('estado vacío con copy que invita a dar y pedir feedback', () => {
    render(<FeedbackListView box="received" viewerId="beto" names={names} items={[]} />);
    expect(screen.getByText('Todavía no recibiste feedback')).toBeVisible();
    expect(screen.getByText(/en las dos direcciones/)).toBeVisible();
  });
});

describe('FeedbackTabs', () => {
  it('Recibido / Enviado como links, el actual con aria-current y contador de sin leer', () => {
    render(<FeedbackTabs current="received" unreadCount={2} />);
    expect(screen.getByRole('link', { name: /Recibido/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Recibido/ })).toHaveTextContent('2 sin leer');
    expect(screen.getByRole('link', { name: 'Enviado' })).toHaveAttribute(
      'href',
      '/feedback?box=sent',
    );
  });
});

describe('FeedbackDetailView', () => {
  it('receptor: muestra el contenido, el enlace al objetivo y "Sin leer" mientras no se marque', () => {
    render(
      <FeedbackDetailView
        fromName="Ana Pérez"
        toName="Beto Gómez"
        content="Gran trabajo"
        createdAt="2026-03-02T15:30:00.000Z"
        readAt={null}
        viewerRole="receiver"
        link={{ objectiveId: 'o1', objectiveTitle: 'Crecer', keyResultTitle: 'Clientes' }}
      />,
    );
    expect(screen.getByTestId('feedback-content')).toHaveTextContent('Gran trabajo');
    expect(screen.getByText('Sin leer')).toBeVisible();
    expect(screen.getByRole('link', { name: /Clientes \(Crecer\)/ })).toHaveAttribute(
      'href',
      '/objetivos/o1',
    );
  });

  it('autor: ve cuándo se leyó', () => {
    render(
      <FeedbackDetailView
        fromName="Ana Pérez"
        toName="Beto Gómez"
        content="Gran trabajo"
        createdAt="2026-03-02T15:30:00.000Z"
        readAt="2026-03-03T10:00:00.000Z"
        viewerRole="author"
        link={null}
      />,
    );
    expect(screen.getByText(/Leído 03\/03\/2026 07:00/)).toBeVisible();
  });

  it('un objetivo enlazado que ya no se ve no filtra su título', () => {
    render(
      <FeedbackDetailView
        fromName="Ana"
        toName="Beto"
        content="x"
        createdAt="2026-03-02T15:30:00.000Z"
        readAt={null}
        viewerRole="receiver"
        link={{ objectiveId: 'o1', objectiveTitle: null, keyResultTitle: null }}
      />,
    );
    expect(screen.getByText(/ya no podés ver/)).toBeVisible();
  });
});

describe('FeedbackForm', () => {
  const people = [
    { id: 'beto', name: 'Beto Gómez' },
    { id: 'cami', name: 'Cami Ruiz' },
  ];

  it('muestra el aviso de privacidad, la guía y solo las personas indicadas (sin quien escribe)', () => {
    render(<FeedbackForm people={people} links={[]} />);
    expect(screen.getByTestId('privacy-notice')).toBeVisible();
    expect(screen.getByText(/en las dos direcciones/)).toBeVisible();
    const select = screen.getByLabelText(/Para quién/);
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Elegí una persona', 'Beto Gómez', 'Cami Ruiz']);
  });

  it('el enlace es opcional (arranca en "Sin enlace") y lista objetivos y KRs', () => {
    render(
      <FeedbackForm
        people={people}
        links={[
          { value: 'obj:o1', label: 'Objetivo: Crecer' },
          { value: 'kr:o1:k1', label: 'Resultado clave: Clientes (Crecer)' },
        ]}
      />,
    );
    const link = screen.getByLabelText(/Objetivo o resultado clave relacionado/);
    expect(link).toHaveValue('');
    expect(within(link).getAllByRole('option')).toHaveLength(3);
  });

  it('envía el FormData con destinatario, mensaje y enlace', async () => {
    actions.createFeedbackAction.mockResolvedValue({ status: 'idle' });
    render(
      <FeedbackForm people={people} links={[{ value: 'obj:o1', label: 'Objetivo: Crecer' }]} />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Para quién/), 'cami');
    await userEvent.type(screen.getByLabelText(/^Mensaje/), 'Buen cierre del trimestre');
    await userEvent.selectOptions(screen.getByLabelText(/relacionado/), 'obj:o1');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar feedback' }));

    const fd = actions.createFeedbackAction.mock.calls[0][1] as FormData;
    expect(fd.get('toUserId')).toBe('cami');
    expect(fd.get('content')).toBe('Buen cierre del trimestre');
    expect(fd.get('link')).toBe('obj:o1');
  });

  it('muestra el error del servidor y conserva lo tipeado', async () => {
    actions.createFeedbackAction.mockResolvedValue({
      status: 'error',
      message: 'No pudimos enviar el feedback. Revisá el mensaje.',
      values: { toUserId: 'cami', content: 'Mi texto' },
    });
    render(<FeedbackForm people={people} links={[]} />);
    await userEvent.type(screen.getByLabelText(/^Mensaje/), 'Mi texto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar feedback' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar el feedback');
    expect(screen.getByLabelText(/^Mensaje/)).toHaveValue('Mi texto');
  });
});

describe('FeedbackAuthorActions', () => {
  const view = () =>
    render(
      <ToastProvider>
        <FeedbackAuthorActions id="f1" content="Texto original" />
      </ToastProvider>,
    );

  it('eliminar pide confirmación con "Eliminar feedback" y no borra al cancelar', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar feedback' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(actions.deleteFeedbackAction).not.toHaveBeenCalled();
  });

  it('confirmar borra el feedback', async () => {
    actions.deleteFeedbackAction.mockResolvedValue({ status: 'success' });
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar feedback' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar feedback' }));
    expect(actions.deleteFeedbackAction).toHaveBeenCalledWith('f1');
  });

  it('editar precarga el mensaje actual', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar feedback' })).toBeVisible();
    expect(screen.getByLabelText(/^Mensaje/)).toHaveValue('Texto original');
  });
});

describe('MarkAsRead', () => {
  it('marca como leído desde un efecto del cliente (Server Action), no durante el render, y refresca', async () => {
    actions.markFeedbackReadAction.mockClear();
    router.refresh.mockClear();
    actions.markFeedbackReadAction.mockResolvedValue({ status: 'success' });
    const { container } = render(<MarkAsRead id="f9" />);
    expect(container).toBeEmptyDOMElement();
    expect(actions.markFeedbackReadAction).toHaveBeenCalledWith('f9');
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
});
