import { describe, expect, it } from 'vitest';
import { buildLinkOptions, decodeLink, encodeKeyResultLink, encodeObjectiveLink } from './okr-link';

describe('okr-link', () => {
  it('codifica y decodifica objetivo y KR', () => {
    expect(decodeLink(encodeObjectiveLink('o1'))).toEqual({ objectiveId: 'o1' });
    expect(decodeLink(encodeKeyResultLink('o1', 'k1'))).toEqual({
      objectiveId: 'o1',
      keyResultId: 'k1',
    });
  });

  it('vacío o malformado = sin enlace', () => {
    for (const raw of ['', 'obj:', 'kr:o1', 'kr:o1:', 'otro:x', 'obj:a:b']) {
      expect(decodeLink(raw)).toBeNull();
    }
  });

  it('buildLinkOptions ofrece objetivo + KRs y omite borradores', () => {
    const options = buildLinkOptions([
      {
        id: 'o1',
        title: 'Crecer',
        status: 'PUBLISHED',
        keyResults: [{ id: 'k1', title: 'Clientes' }],
      },
      { id: 'o2', title: 'Borrador', status: 'DRAFT', keyResults: [] },
    ]);
    expect(options.map((o) => o.value)).toEqual(['obj:o1', 'kr:o1:k1']);
  });
});
