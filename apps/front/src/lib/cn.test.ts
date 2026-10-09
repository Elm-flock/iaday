import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('no confunde tamaños de texto del sistema con colores', () => {
    expect(cn('text-on-primary text-button-sm')).toBe('text-on-primary text-button-sm');
    expect(cn('text-body-sm text-ink-muted')).toBe('text-body-sm text-ink-muted');
  });

  it('resuelve conflictos reales: la última gana', () => {
    expect(cn('text-ink text-primary-text')).toBe('text-primary-text');
    expect(cn('text-button text-body')).toBe('text-body');
    expect(cn('px-s10 px-s20')).toBe('px-s20');
    expect(cn('rounded-md rounded-pill')).toBe('rounded-pill');
  });
});
