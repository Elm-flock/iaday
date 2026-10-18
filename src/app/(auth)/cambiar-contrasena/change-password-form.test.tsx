import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './_components/change-password-form';

const changePasswordAction = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ changePasswordAction }));

beforeEach(() => changePasswordAction.mockReset());

describe('ChangePasswordForm', () => {
  it('forzado: pide la contraseña inicial y explica el mínimo de 12 caracteres', () => {
    render(<ChangePasswordForm next="/" forced />);
    expect(screen.getByLabelText(/Contraseña inicial/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña nueva/)).toHaveAccessibleDescription(
      /Al menos 12 caracteres/,
    );
    expect(screen.getByLabelText(/Repetí la contraseña nueva/)).toBeInTheDocument();
  });

  it('voluntario: pide la contraseña actual', () => {
    render(<ChangePasswordForm next="/" forced={false} />);
    expect(screen.getByLabelText(/Contraseña actual/)).toBeInTheDocument();
  });

  it('envía los campos y el destino; los errores salen junto al campo y la alerta general', async () => {
    changePasswordAction.mockResolvedValue({
      status: 'error',
      message: 'Revisá los campos marcados y probá de nuevo.',
      fieldErrors: {
        newPassword: 'La contraseña nueva tiene que tener entre 12 y 200 caracteres.',
      },
      values: { next: '/objetivos' },
    });
    render(<ChangePasswordForm next="/objetivos" forced />);
    await userEvent.type(screen.getByLabelText(/Contraseña inicial/), 'inicial');
    await userEvent.type(screen.getByLabelText(/^Contraseña nueva/), 'corta');
    await userEvent.type(screen.getByLabelText(/Repetí/), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    const formData = changePasswordAction.mock.calls[0][1] as FormData;
    expect(formData.get('currentPassword')).toBe('inicial');
    expect(formData.get('newPassword')).toBe('corta');
    expect(formData.get('next')).toBe('/objetivos');
    expect(await screen.findByText(/entre 12 y 200 caracteres/)).toBeInTheDocument();
    expect(screen.getByText('Revisá los campos marcados y probá de nuevo.')).toBeInTheDocument();
  });
});
