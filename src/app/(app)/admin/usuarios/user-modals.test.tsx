import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateUserButton } from './_components/user-modals';
import { ToastProvider } from '@/components/ui/toast';

const actions = vi.hoisted(() => ({
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));
vi.mock('./actions', () => actions);

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

async function openAndSubmit() {
  render(
    <ToastProvider>
      <CreateUserButton />
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
  await userEvent.type(screen.getByLabelText(/Nombre/), 'Lucía Gómez');
  await userEvent.type(screen.getByLabelText(/Email/), 'lucia@x.com');
  await userEvent.click(screen.getAllByRole('button', { name: 'Crear usuario' }).at(-1)!);
}

describe('alta de usuario con clave inicial', () => {
  it('la contraseña es opcional y el formulario explica qué pasa si se deja en blanco', async () => {
    render(
      <ToastProvider>
        <CreateUserButton />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    const field = screen.getByLabelText('Contraseña inicial');
    expect(field).not.toBeRequired();
    expect(field).toHaveAccessibleDescription(/Si la dejás en blanco, generamos una segura/);
    expect(screen.getByText(/tendrá que cambiarla en su primer ingreso/)).toBeInTheDocument();
  });

  it('si el back genera la clave, se muestra UNA vez con aviso y botón de copiar, y el diálogo no se cierra solo', async () => {
    actions.createUserAction.mockResolvedValue({
      status: 'success',
      message: 'Creamos el usuario de Lucía Gómez.',
      secret: 'Gen-Erada-7788',
    });
    await openAndSubmit();

    expect(await screen.findByRole('dialog', { name: 'Usuario creado' })).toBeInTheDocument();
    expect(screen.getByText('Gen-Erada-7788')).toBeInTheDocument();
    expect(screen.getByText('Se muestra una sola vez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar contraseña' })).toBeInTheDocument();
  });

  it('copiar deja la clave en el portapapeles', async () => {
    const user = userEvent.setup();
    actions.createUserAction.mockResolvedValue({
      status: 'success',
      message: 'Creamos el usuario.',
      secret: 'Gen-Erada-7788',
    });
    render(
      <ToastProvider>
        <CreateUserButton />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await user.type(screen.getByLabelText(/Nombre/), 'Lucía');
    await user.type(screen.getByLabelText(/Email/), 'l@x.com');
    await user.click(screen.getAllByRole('button', { name: 'Crear usuario' }).at(-1)!);
    await user.click(await screen.findByRole('button', { name: 'Copiar contraseña' }));
    expect(await navigator.clipboard.readText()).toBe('Gen-Erada-7788');
  });

  it('cerrar el aviso descarta la clave: al abrir de nuevo ya no está', async () => {
    actions.createUserAction.mockResolvedValue({
      status: 'success',
      message: 'Creamos el usuario.',
      secret: 'Gen-Erada-7788',
    });
    await openAndSubmit();
    await userEvent.click(await screen.findByRole('button', { name: 'Ya la copié, cerrar' }));
    await waitFor(() => expect(screen.queryByText('Gen-Erada-7788')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(screen.queryByText('Gen-Erada-7788')).toBeNull();
    expect(screen.getByLabelText('Contraseña inicial')).toHaveValue('');
  });

  it('si se definió contraseña, no hay clave que mostrar y el diálogo se cierra con aviso', async () => {
    actions.createUserAction.mockResolvedValue({
      status: 'success',
      message: 'Creamos el usuario de Lucía Gómez.',
    });
    await openAndSubmit();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear usuario' })).toBeNull());
    expect(screen.queryByTestId('one-time-secret')).toBeNull();
    expect(await screen.findByText('Creamos el usuario de Lucía Gómez.')).toBeInTheDocument();
  });
});
