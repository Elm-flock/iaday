import {
  checkInActionLabel,
  checkInSegments,
  feedbackSegments,
  formatDecimalEs,
  krSummaryInput,
  krTargetText,
  mustPreserveFromKrs,
  objectiveSegments,
  okrSuggestInput,
} from './minimize';

const kr = (position: number, over: Partial<Parameters<typeof krTargetText>[0]> = {}) => ({
  position,
  title: `KR ${position}`,
  unit: '%',
  startValue: '40.0000',
  targetValue: '75',
  ...over,
});

describe('formatDecimalEs', () => {
  it('quita ceros finales y usa coma', () => {
    expect(formatDecimalEs('40.0000')).toBe('40');
    expect(formatDecimalEs('5.5000')).toBe('5,5');
    expect(formatDecimalEs('-3.25')).toBe('-3,25');
  });
  it('deja intacto lo que no es decimal', () => {
    expect(formatDecimalEs(' abc ')).toBe('abc');
  });
});

describe('krTargetText / mustPreserveFromKrs', () => {
  it('arma "de A a B unidad"', () => {
    expect(krTargetText(kr(1))).toBe('de 40 a 75 %');
    expect(krTargetText(kr(1, { unit: null }))).toBe('de 40 a 75');
  });
  it('null sin valores', () => {
    expect(krTargetText(kr(1, { startValue: null }))).toBeNull();
  });
  it('mustPreserve deduplica y limita a 50', () => {
    expect(mustPreserveFromKrs([kr(1), kr(2, { startValue: null, targetValue: '75' })])).toEqual([
      '40',
      '75',
    ]);
    const many = Array.from({ length: 80 }, (_, i) => ({
      startValue: String(i),
      targetValue: null,
    }));
    expect(mustPreserveFromKrs(many)).toHaveLength(50);
  });
});

describe('objectiveSegments', () => {
  it('incluye título, descripción y KRs ordenados por posición', () => {
    const segs = objectiveSegments({
      title: ' Mejorar soporte ',
      description: 'Desc',
      keyResults: [kr(2), kr(1, { startValue: null })],
    });
    expect(segs.map((s) => s.key)).toEqual([
      'objective.title',
      'objective.description',
      'kr.1.title',
      'kr.2.title',
      'kr.2.target',
    ]);
    expect(segs[0].text).toBe('Mejorar soporte');
  });
  it('omite la descripción vacía', () => {
    const segs = objectiveSegments({ title: 'T', description: '  ', keyResults: [] });
    expect(segs).toHaveLength(1);
  });
  it('recorta segmentos a 4000 caracteres', () => {
    const segs = objectiveSegments({ title: 'x'.repeat(5000), description: null, keyResults: [] });
    expect(segs[0].text).toHaveLength(4000);
  });
  it('nunca supera 30 segmentos y las claves cumplen el patrón del contrato', () => {
    const krs = Array.from({ length: 20 }, (_, i) => kr(i + 1));
    const segs = objectiveSegments({ title: 'T', description: 'D', keyResults: krs });
    expect(segs.length).toBeLessThanOrEqual(30);
    expect(segs.every((s) => /^[a-z0-9_.]+$/.test(s.key))).toBe(true);
  });
  it('no filtra ids ni emails: solo textos', () => {
    const segs = objectiveSegments({ title: 'T', description: null, keyResults: [kr(1)] });
    expect(JSON.stringify(segs)).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe('checkInSegments / feedbackSegments', () => {
  it('check-in sin nota no tiene nada que adaptar', () => {
    expect(checkInSegments({ note: null, action: 'CONTINUE' }, 'KR')).toEqual([]);
    expect(checkInSegments({ note: '  ', action: 'CONTINUE' }, 'KR')).toEqual([]);
  });
  it('check-in con nota usa las claves del contrato', () => {
    expect(checkInSegments({ note: 'Bajamos a 5,5 h', action: 'UPDATE' }, 'Reducir')).toEqual([
      { key: 'checkin.kr_title', text: 'Reducir' },
      { key: 'checkin.action', text: 'Actualizar' },
      { key: 'checkin.note', text: 'Bajamos a 5,5 h' },
    ]);
  });
  it('mapea cada accion a la etiqueta es-AR de la UI, sin enums crudos', () => {
    expect((['CONTINUE', 'UPDATE', 'START', 'STOP'] as const).map(checkInActionLabel)).toEqual([
      'Continuar',
      'Actualizar',
      'Iniciar',
      'Detener',
    ]);
    for (const action of ['CONTINUE', 'UPDATE', 'START', 'STOP']) {
      const segs = checkInSegments({ note: 'nota', action }, 'KR');
      expect(segs.find((s) => s.key === 'checkin.action')?.text).not.toBe(action);
    }
    expect(checkInActionLabel('OTRA')).toBe('OTRA');
  });
  it('feedback vacío -> []', () => {
    expect(feedbackSegments({ content: ' ' })).toEqual([]);
    expect(feedbackSegments({ content: 'Gracias' })).toEqual([
      { key: 'feedback.content', text: 'Gracias' },
    ]);
  });
});

describe('okrSuggestInput', () => {
  it('normaliza nulos, recorta y limita a 5 KRs', () => {
    const body = okrSuggestInput({
      cycleKind: 'QUARTER',
      objective: { title: ' mejorar soporte ', description: ' ', type: 'COMMITTED' },
      keyResults: Array.from({ length: 7 }, (_, i) => ({
        title: ` kr ${i} `,
        startValue: i === 0 ? '8' : undefined,
      })),
    });
    expect(body.objective).toEqual({
      title: 'mejorar soporte',
      description: null,
      type: 'COMMITTED',
    });
    expect(body.keyResults).toHaveLength(5);
    expect(body.keyResults[0]).toEqual({
      title: 'kr 0',
      unit: null,
      startValue: '8',
      targetValue: null,
    });
  });
});

describe('krSummaryInput', () => {
  const base = {
    title: 'KR',
    scoring: 'DERIVED' as const,
    unit: 'h',
    startValue: '8',
    targetValue: '4',
    currentValue: '5.5',
  };
  const ci = (day: number, note: string | null = null) => ({
    createdAt: new Date(Date.UTC(2026, 9, day)),
    value: '6',
    score: 0.5,
    band: 'YELLOW' as const,
    action: 'CONTINUE' as const,
    note,
  });
  it('ordena ascendente, formatea fecha y no incluye autor', () => {
    const body = krSummaryInput(base, [ci(15), ci(1), ci(8)], 'PLAIN');
    expect(body.checkIns.map((c) => c.date)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    expect(Object.keys(body.checkIns[0])).not.toContain('authorId');
    expect(body.level).toBe('PLAIN');
  });
  it('se queda con los últimos 52', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...ci(1),
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
    }));
    const body = krSummaryInput(base, many, 'STANDARD');
    expect(body.checkIns).toHaveLength(52);
    expect(body.checkIns[0].date).toBe('2026-01-09');
  });
});
