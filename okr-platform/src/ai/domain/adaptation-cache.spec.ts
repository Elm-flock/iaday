import { currentPromptFor, decideAdaptationCache, promptIdForLevel } from './adaptation-cache';

const row = (status: Parameters<typeof decideAdaptationCache>[0]['status'], version = '1') => ({
  status,
  promptId: 'easy_read',
  promptVersion: version,
});
const current = { id: 'easy_read', version: '3' };

describe('decideAdaptationCache', () => {
  it('VALIDATED se sirve aunque el prompt haya cambiado', () => {
    expect(decideAdaptationCache(row('VALIDATED', '1'), current)).toBe('SERVE');
  });
  it('ACCEPTED se sirve aunque el prompt haya cambiado', () => {
    expect(decideAdaptationCache(row('ACCEPTED', '1'), current)).toBe('SERVE');
  });
  it.each(['DRAFT', 'NEEDS_REVIEW'] as const)('%s con prompt vencido se regenera', (status) => {
    expect(decideAdaptationCache(row(status, '1'), current)).toBe('REGENERATE');
  });
  it('DRAFT con otro promptId se regenera', () => {
    expect(
      decideAdaptationCache({ ...row('DRAFT', '3'), promptId: 'plain_language' }, current),
    ).toBe('REGENERATE');
  });
  it.each(['DRAFT', 'NEEDS_REVIEW'] as const)('%s con el prompt vigente se sirve', (status) => {
    expect(decideAdaptationCache(row(status, '3'), current)).toBe('SERVE');
  });
  it('sin prompt vigente conocido se sirve (no hay evidencia de vencimiento)', () => {
    expect(decideAdaptationCache(row('DRAFT', '1'), null)).toBe('SERVE');
  });
});

describe('currentPromptFor', () => {
  const prompts = [
    { id: 'easy_read', version: '3' },
    { id: 'plain_language', version: '2' },
  ];
  it('mapea nivel -> prompt', () => {
    expect(promptIdForLevel('EASY_READ')).toBe('easy_read');
    expect(currentPromptFor('PLAIN', prompts)).toEqual({ id: 'plain_language', version: '2' });
  });
  it('null si el agente no lo informa', () => {
    expect(currentPromptFor('PLAIN', [])).toBeNull();
    expect(currentPromptFor('PLAIN', null)).toBeNull();
  });
});
