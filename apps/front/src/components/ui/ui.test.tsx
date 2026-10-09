import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BandBadge } from './status-badge';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';
import { FormField } from './form-field';
import { IconButton } from './icon-button';
import { Modal } from './modal';
import { ScoreBar } from './score-bar';
import { TextInput } from './text-input';

describe('Button', () => {
  it('en loading queda deshabilitado, marca aria-busy y no dispara onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar cambios
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled no dispara onClick y por defecto es type=button', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Enviar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Enviar' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('type', 'button');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('dispara onClick cuando está habilitado', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('IconButton', () => {
  it('expone el aria-label como nombre accesible', () => {
    render(
      <IconButton aria-label="Eliminar KR">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Eliminar KR' })).toBeInTheDocument();
  });
});

describe('FormField', () => {
  it('vincula label, ayuda y error con el control', () => {
    render(
      <FormField label="Título" required help="Máximo 120 caracteres." error="Completá el título.">
        <TextInput />
      </FormField>,
    );
    const input = screen.getByLabelText(/Título/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const texts = describedBy.split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Completá el título.', 'Máximo 120 caracteres.']);
  });

  it('sin error no marca aria-invalid', () => {
    render(
      <FormField label="Nombre">
        <TextInput />
      </FormField>,
    );
    const input = screen.getByLabelText('Nombre');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('BandBadge', () => {
  it.each([
    [0.39, 'En riesgo', 'at-risk'],
    [0.4, 'Requiere atención', 'attention'],
    [0.69, 'Requiere atención', 'attention'],
    [0.7, 'En ruta', 'on-track'],
  ])('score %s -> %s', (score, label, band) => {
    const { container } = render(<BandBadge score={score} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-band', band);
    // ícono presente además de la palabra: el estado no depende solo del color
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('ScoreBar', () => {
  it('expone un meter con valor en formato AR', () => {
    render(<ScoreBar score={0.7} label="Retención" />);
    const meter = screen.getByRole('meter', { name: 'Retención' });
    expect(meter).toHaveAttribute('aria-valuenow', '0.7');
    expect(meter).toHaveAttribute('aria-valuetext', '0,70');
  });
});

describe('Modal', () => {
  it('abre con título accesible y cierra con Esc', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Nuevo resultado clave">
        <p>Contenido</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Nuevo resultado clave' });
    expect(dialog).toHaveAttribute('open');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cierra con el botón Cerrar', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Título" />);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('no está abierto cuando open=false', () => {
    render(<Modal open={false} onClose={() => {}} title="Oculto" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('muestra la acción explícita y llama a onConfirm / onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Eliminar partner"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar partner"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar partner' });
    expect(dialog).toHaveAccessibleDescription('Esta acción no se puede deshacer.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar partner' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
