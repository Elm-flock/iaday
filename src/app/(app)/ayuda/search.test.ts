import { describe, expect, it } from 'vitest';
import { HELP, manualsForRole } from './help-data';
import { normalize, searchSections } from './search';

const all = HELP.manuals.flatMap((m) => m.sections);

describe('searchSections', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalize('Cómo ÑANDÚ')).toBe('como nandu');
    expect(searchSections(all, 'como creo un ciclo').length).toBeGreaterThan(0);
  });

  it('exige todas las palabras y pone primero los títulos que coinciden', () => {
    for (const h of searchSections(all, 'usuario contraseña')) {
      const text = normalize(`${h.section.title} ${h.section.plainText}`);
      expect(['usuario', 'contrasena'].every((t) => text.includes(t))).toBe(true);
    }
    const titled = searchSections(all, 'ciclo');
    const firstNonTitle = titled.findIndex((h) => !h.inTitle);
    if (firstNonTitle >= 0) expect(titled.slice(firstNonTitle).every((h) => !h.inTitle)).toBe(true);
  });

  it('consulta vacía o de una letra: sin resultados; tope de resultados', () => {
    expect(searchSections(all, '')).toEqual([]);
    expect(searchSections(all, 'a')).toEqual([]);
    expect(searchSections(all, 'de la').length).toBeLessThanOrEqual(20);
  });

  it('un integrante no encuentra nada del manual de administración', () => {
    const member = manualsForRole('MEMBER').flatMap((m) => m.sections);
    expect(member.some((s) => s.manual === 'admin')).toBe(false);
    expect(searchSections(member, 'auditoría').every((h) => h.section.manual === 'usuario')).toBe(
      true,
    );
  });
});
