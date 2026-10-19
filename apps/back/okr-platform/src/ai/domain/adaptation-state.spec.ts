import { acceptTransition, validateEditedSegments, validateTransition } from './adaptation-state';

describe('acceptTransition', () => {
  it('DRAFT -> ACCEPTED', () => {
    expect(acceptTransition('DRAFT')).toEqual({ ok: true, value: 'ACCEPTED' });
  });
  it.each(['ACCEPTED', 'VALIDATED', 'NEEDS_REVIEW'] as const)('%s -> conflicto', (s) => {
    expect(acceptTransition(s)).toMatchObject({ ok: false, code: 'AI_ADAPTATION_STATE_CONFLICT' });
  });
});

describe('validateTransition', () => {
  it.each(['DRAFT', 'ACCEPTED', 'NEEDS_REVIEW'] as const)('%s -> VALIDATED', (s) => {
    expect(validateTransition(s)).toEqual({ ok: true, value: 'VALIDATED' });
  });
  it('VALIDATED es terminal', () => {
    expect(validateTransition('VALIDATED')).toMatchObject({
      ok: false,
      code: 'AI_ADAPTATION_STATE_CONFLICT',
    });
  });
});

describe('validateEditedSegments', () => {
  const existing = [
    { key: 'a', text: 'x' },
    { key: 'b', text: 'y' },
  ];
  it('acepta las mismas claves y orden', () => {
    expect(
      validateEditedSegments(existing, [
        { key: 'a', text: 'nuevo' },
        { key: 'b', text: 'otro' },
      ]).ok,
    ).toBe(true);
  });
  it('rechaza cantidad, orden o claves distintas', () => {
    expect(validateEditedSegments(existing, [{ key: 'a', text: 'x' }]).ok).toBe(false);
    expect(
      validateEditedSegments(existing, [
        { key: 'b', text: 'y' },
        { key: 'a', text: 'x' },
      ]).ok,
    ).toBe(false);
  });
  it('rechaza textos vacíos', () => {
    expect(
      validateEditedSegments(existing, [
        { key: 'a', text: ' ' },
        { key: 'b', text: 'y' },
      ]),
    ).toMatchObject({ ok: false, code: 'AI_EDITED_CONTENT_INVALID' });
  });
});
