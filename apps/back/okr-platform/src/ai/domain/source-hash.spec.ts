import { canonicalJson, sourceHash } from './source-hash';

describe('canonicalJson', () => {
  it('ordena claves recursivamente e ignora undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: undefined }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"z":1}]},"b":1}',
    );
  });
  it('serializa primitivos', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('sourceHash', () => {
  const segs = [{ key: 'a', text: 'hola' }];
  it('es estable y hex de 64 chars', () => {
    expect(sourceHash(segs, 'PLAIN')).toBe(sourceHash([{ text: 'hola', key: 'a' }], 'PLAIN'));
    expect(sourceHash(segs, 'PLAIN')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('cambia con el texto, o el nivel', () => {
    const base = sourceHash(segs, 'PLAIN');
    expect(sourceHash([{ key: 'a', text: 'hola!' }], 'PLAIN')).not.toBe(base);
    expect(sourceHash(segs, 'EASY_READ')).not.toBe(base);
  });
});
