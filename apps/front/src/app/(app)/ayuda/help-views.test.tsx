import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpHomeView, ManualView } from './_components/help-views';
import { HELP, findManual, isManualId, manualsForRole } from './help-data';
import { searchSections } from './search';

const usuario = findManual('usuario')!;

describe('ayuda según el rol', () => {
  it('integrante y líder solo reciben el manual de usuario; administración, ambos', () => {
    expect(manualsForRole('MEMBER').map((m) => m.id)).toEqual(['usuario']);
    expect(manualsForRole('LEADER').map((m) => m.id)).toEqual(['usuario']);
    expect(manualsForRole('ADMIN').map((m) => m.id)).toEqual(['usuario', 'admin']);
    expect(isManualId('admin')).toBe(true);
    expect(isManualId('otro')).toBe(false);
    expect(findManual('otro')).toBeUndefined();
  });
});

describe('HelpHomeView', () => {
  it('integrante: una tarjeta (usuario), sin mención al manual de administración', () => {
    render(<HelpHomeView manuals={manualsForRole('MEMBER')} query="" hits={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Abrir el manual: Manual de usuario/ }),
    ).toHaveAttribute('href', '/ayuda/usuario');
    expect(screen.queryByRole('link', { name: /administración/i })).not.toBeInTheDocument();
  });

  it('administración: dos tarjetas', () => {
    render(<HelpHomeView manuals={manualsForRole('ADMIN')} query="" hits={null} />);
    expect(
      screen.getByRole('link', { name: /Abrir el manual: Manual de administración/ }),
    ).toHaveAttribute('href', '/ayuda/admin');
    expect(
      screen.getByRole('link', { name: /Abrir el manual: Manual de usuario/ }),
    ).toBeInTheDocument();
  });

  it('búsqueda: formulario GET con q, resultados con enlace a la ancla y resumen', () => {
    const manuals = manualsForRole('MEMBER');
    const hits = searchSections(
      manuals.flatMap((m) => m.sections),
      'check-in',
    );
    render(<HelpHomeView manuals={manuals} query="check-in" hits={hits} />);
    expect(screen.getByRole('search')).toHaveAttribute('method', 'get');
    expect(screen.getByRole('searchbox', { name: 'Buscar en la ayuda' })).toHaveValue('check-in');
    expect(screen.getByRole('status')).toHaveTextContent(/resultados? para «check-in»/);
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getAllByRole('link')[0].getAttribute('href')).toMatch(
      /^\/ayuda\/usuario#/,
    );
    expect(screen.getByRole('link', { name: 'Quitar la búsqueda' })).toHaveAttribute(
      'href',
      '/ayuda',
    );
  });

  it('búsqueda sin resultados: lo dice con palabras', () => {
    render(<HelpHomeView manuals={manualsForRole('MEMBER')} query="zzzzzz" hits={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No encontramos nada para «zzzzzz».');
  });
});

describe('ManualView', () => {
  it('un solo h1, índice con H2/H3 y títulos con id estable y foco programático', () => {
    render(<ManualView manual={usuario} available={manualsForRole('MEMBER')} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const toc = screen.getByRole('navigation', { name: 'Contenido del manual' });
    expect(within(toc).getAllByRole('link')).toHaveLength(
      usuario.sections.filter((s) => s.level === 2 || s.level === 3).length,
    );
    const h3 = screen.getByRole('heading', { level: 3, name: /Cómo ingreso a la plataforma/ });
    expect(h3).toHaveAttribute('id', 'cómo-ingreso-a-la-plataforma');
    expect(h3).toHaveAttribute('tabindex', '-1');
    expect(within(toc).getByRole('link', { name: 'Cómo ingreso a la plataforma' })).toHaveAttribute(
      'href',
      '#cómo-ingreso-a-la-plataforma',
    );
  });

  it('saltos de teclado, copiar enlace por sección e impresión', () => {
    render(<ManualView manual={usuario} available={manualsForRole('MEMBER')} />);
    expect(screen.getByRole('link', { name: 'Saltar al contenido del manual' })).toHaveAttribute(
      'href',
      '#contenido-manual',
    );
    expect(screen.getByRole('link', { name: 'Ir al índice' })).toHaveAttribute('href', '#indice');
    expect(
      screen.getByRole('link', { name: 'Copiar enlace a «Cómo ingreso a la plataforma»' }),
    ).toHaveAttribute('href', '#cómo-ingreso-a-la-plataforma');
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('integrante: sin pestañas; administración: pestañas entre los dos manuales', () => {
    const { unmount } = render(
      <ManualView manual={usuario} available={manualsForRole('MEMBER')} />,
    );
    expect(screen.queryByRole('navigation', { name: 'Manuales' })).not.toBeInTheDocument();
    unmount();
    render(<ManualView manual={usuario} available={manualsForRole('ADMIN')} />);
    const tabs = screen.getByRole('navigation', { name: 'Manuales' });
    expect(within(tabs).getByRole('link', { name: 'Manual de usuario' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Manual de administración' })).toHaveAttribute(
      'href',
      '/ayuda/admin',
    );
  });

  it('tablas: región enfocable con encabezados; capturas con texto alternativo', () => {
    render(<ManualView manual={findManual('admin')!} available={manualsForRole('ADMIN')} />);
    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThan(0);
    expect(within(tables[0]).getAllByRole('columnheader').length).toBeGreaterThan(0);
    expect(tables[0].closest('[role="region"]')).toHaveAttribute('tabindex', '0');
    const imgs = screen.getAllByRole('img');
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.every((i) => (i.getAttribute('alt') ?? '').length > 0)).toBe(true);
  });

  it('no inyecta HTML: ningún script ni atributo on*', () => {
    const { container } = render(
      <ManualView manual={usuario} available={manualsForRole('ADMIN')} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick],[onerror]')).toBeNull();
  });
});

describe('HelpAnchors (foco y copiar enlace)', () => {
  it('copia el enlace, lo anuncia y mueve el foco al título', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ManualView manual={usuario} available={manualsForRole('MEMBER')} />);
    await userEvent.click(
      screen.getByRole('link', { name: 'Copiar enlace a «Cómo ingreso a la plataforma»' }),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('#c%C3%B3mo-ingreso-a-la-plataforma'),
    );
    expect(await screen.findByText('Enlace copiado.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Cómo ingreso a la plataforma/ })).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it('foco al cargar con un ancla en la URL', () => {
    window.location.hash = '#primeros-pasos';
    render(<ManualView manual={usuario} available={manualsForRole('MEMBER')} />);
    expect(screen.getByRole('heading', { level: 2, name: /Primeros pasos/ })).toHaveFocus();
    window.location.hash = '';
  });
});

describe('contenido generado', () => {
  it('hay dos manuales con versión y fecha', () => {
    expect(HELP.manuals.map((m) => m.id)).toEqual(['usuario', 'admin']);
    expect(HELP.manuals.every((m) => m.version && m.updated)).toBe(true);
  });
});
