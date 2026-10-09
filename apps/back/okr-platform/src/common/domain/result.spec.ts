import { err, ok } from './result';

describe('Result', () => {
  it('ok() sin valor', () => {
    expect(ok()).toEqual({ ok: true, value: undefined });
  });

  it('ok(value) conserva el valor', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('err() lleva código y mensaje', () => {
    expect(err('X', 'falló')).toEqual({ ok: false, code: 'X', message: 'falló' });
  });
});
