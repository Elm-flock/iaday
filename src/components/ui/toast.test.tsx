import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS, ToastProvider, useToast } from './toast';

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.show('Guardado')}>ok</button>
      <button onClick={() => toast.show('Falló', 'danger')}>error</button>
    </>
  );
}

const setup = () =>
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Toast', () => {
  it('se cierra solo a los 5 s', () => {
    setup();
    click('ok');
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('se pausa con el puntero encima y retoma con lo que faltaba', () => {
    setup();
    click('ok');
    const toast = screen.getByText('Guardado').closest('[role="status"]') as HTMLElement;
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(1900));
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('se pausa mientras el foco está adentro', () => {
    setup();
    click('ok');
    const toast = screen.getByText('Guardado').closest('[role="status"]') as HTMLElement;
    fireEvent.focus(toast);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    fireEvent.blur(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 1));
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('muestra como máximo los 3 más nuevos', () => {
    setup();
    for (let i = 0; i < 5; i++) click('ok');
    expect(screen.getAllByText('Guardado')).toHaveLength(MAX_VISIBLE_TOASTS);
  });

  it('mantiene la accesibilidad: status para éxito y alert para error, con botón de cierre', () => {
    setup();
    click('ok');
    click('error');
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar notificación' })[0]);
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('el contenedor no captura clics fuera de cada toast (no tapa acciones)', () => {
    setup();
    click('ok');
    const region = screen.getByRole('region', { name: 'Notificaciones' });
    expect(region.className).toContain('pointer-events-none');
    expect(region.className).toContain('left-s20');
  });
});
