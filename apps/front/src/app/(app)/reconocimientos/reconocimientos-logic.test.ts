import { describe, expect, it } from 'vitest';
import { RECOGNITION_ERROR_COPY } from './messages';
import { isMilestone, listMilestones, MILESTONE_KR_SCORE } from './milestones';
import { parseCreateRecognition } from './recognition-form-data';
import { failureMessage } from '@/lib/api/error-copy';

const objective = (over = {}) => ({
  id: 'o1',
  title: 'Crecer',
  status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'CLOSED',
  ownerUserId: 'ana' as string | null,
  score: 0.5,
  finalScore: null as number | null,
  keyResults: [] as { id: string; title: string; score: number }[],
  ...over,
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe('isMilestone (espejo del back)', () => {
  it('el umbral es 0,70 inclusivo: 0,69 no, 0,70 sí', () => {
    expect(MILESTONE_KR_SCORE).toBe(0.7);
    expect(isMilestone({ score: 0.69 }, { status: 'PUBLISHED' })).toBe(false);
    expect(isMilestone({ score: 0.7 }, { status: 'PUBLISHED' })).toBe(true);
    expect(isMilestone({ score: 1 }, null)).toBe(true);
  });

  it('un objetivo CLOSED es hito aunque el KR no llegue', () => {
    expect(isMilestone({ score: 0.1 }, { status: 'CLOSED' })).toBe(true);
    expect(isMilestone(null, { status: 'CLOSED' })).toBe(true);
    expect(isMilestone(null, { status: 'PUBLISHED' })).toBe(false);
    expect(isMilestone(null, null)).toBe(false);
  });
});

describe('listMilestones', () => {
  it('ofrece KRs con score >= 0,70 y no los de 0,69', () => {
    const options = listMilestones(
      [
        objective({
          keyResults: [
            { id: 'k69', title: 'Casi', score: 0.69 },
            { id: 'k70', title: 'Justo', score: 0.7 },
            { id: 'k100', title: 'Total', score: 1 },
          ],
        }),
      ],
      'ana',
    );
    expect(options.map((o) => o.keyResultId)).toEqual(['k70', 'k100']);
    expect(options[0]).toMatchObject({ kind: 'kr', value: 'kr:o1:k70', objectiveTitle: 'Crecer' });
  });

  it('un objetivo CLOSED se ofrece entero (con su puntaje final) y también sus KRs que llegaron', () => {
    const options = listMilestones(
      [
        objective({
          status: 'CLOSED',
          finalScore: 0.55,
          keyResults: [
            { id: 'k1', title: 'Bajo', score: 0.2 },
            { id: 'k2', title: 'Alto', score: 0.9 },
          ],
        }),
      ],
      'ana',
    );
    expect(options.map((o) => o.value)).toEqual(['obj:o1', 'kr:o1:k2']);
    expect(options[0]).toMatchObject({ kind: 'objective', score: 0.55 });
  });

  it('ignora borradores y objetivos de otras personas o de equipos', () => {
    const options = listMilestones(
      [
        objective({ id: 'd', status: 'DRAFT', keyResults: [{ id: 'k', title: 'k', score: 1 }] }),
        objective({ id: 'x', ownerUserId: 'beto', status: 'CLOSED' }),
        objective({ id: 't', ownerUserId: null, status: 'CLOSED' }),
      ],
      'ana',
    );
    expect(options).toEqual([]);
  });
});

describe('listMilestones: KRs de objetivos de equipo', () => {
  const team = (over = {}) =>
    objective({ id: 'tobj', ownerUserId: null, ownerTeamId: 'team-1', ...over });

  it('ofrece solo los KRs que la persona ejecuta y con score >= 0,70', () => {
    const options = listMilestones(
      [
        team({
          keyResults: [
            { id: 'mio-alto', title: 'Mío alto', score: 0.8, ownerId: 'ana' },
            { id: 'mio-bajo', title: 'Mío bajo', score: 0.69, ownerId: 'ana' },
            { id: 'ajeno', title: 'Ajeno', score: 0.95, ownerId: 'beto' },
          ],
        }),
      ],
      'ana',
    );
    expect(options.map((o) => o.value)).toEqual(['kr:tobj:mio-alto']);
    expect(options[0]).toMatchObject({ kind: 'kr', inTeamObjective: true, score: 0.8 });
  });

  it('no ofrece el objetivo de equipo en sí, ni cerrado, ni borradores de equipo', () => {
    const options = listMilestones(
      [
        team({ status: 'CLOSED', finalScore: 0.9 }),
        team({
          id: 'draft',
          status: 'DRAFT',
          keyResults: [{ id: 'k', title: 'k', score: 1, ownerId: 'ana' }],
        }),
      ],
      'ana',
    );
    expect(options).toEqual([]);
  });

  it('convive con los hitos de sus objetivos individuales', () => {
    const options = listMilestones(
      [
        objective({ keyResults: [{ id: 'k1', title: 'Propio', score: 0.9 }] }),
        team({ keyResults: [{ id: 'k2', title: 'Equipo', score: 0.75, ownerId: 'ana' }] }),
      ],
      'ana',
    );
    expect(options.map((o) => o.value)).toEqual(['kr:o1:k1', 'kr:tobj:k2']);
  });
});

describe('parseo del reconocimiento', () => {
  it('exige persona, logro y mensaje', () => {
    const r = parseCreateRecognition(form({ toUserId: '', milestone: '', message: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.fieldErrors).sort()).toEqual(['message', 'milestone', 'toUserId']);
  });

  it('traduce el logro a objectiveId/keyResultId', () => {
    expect(
      parseCreateRecognition(form({ toUserId: 'ana', milestone: 'kr:o1:k1', message: 'Bien' })),
    ).toEqual({
      ok: true,
      body: { toUserId: 'ana', message: 'Bien', objectiveId: 'o1', keyResultId: 'k1' },
    });
    expect(
      parseCreateRecognition(form({ toUserId: 'ana', milestone: 'obj:o1', message: 'Bien' })),
    ).toEqual({ ok: true, body: { toUserId: 'ana', message: 'Bien', objectiveId: 'o1' } });
  });
});

describe('copy de errores', () => {
  it('MILESTONE_NOT_REACHED explica la regla y cómo seguir', () => {
    const msg = failureMessage(
      { status: 422, body: { code: 'MILESTONE_NOT_REACHED' } },
      RECOGNITION_ERROR_COPY,
    );
    expect(msg).toMatch(/0,70/);
    expect(msg).toMatch(/Elegí otro logro/);
  });

  it('autorreconocimiento (400) y 404', () => {
    expect(
      failureMessage(
        { status: 400, body: { statusCode: 400, message: 'x', code: 'RECOGNITION_SELF' } },
        RECOGNITION_ERROR_COPY,
      ),
    ).toMatch(/No podés reconocerte a vos mismo/);
    expect(failureMessage({ status: 404 }, RECOGNITION_ERROR_COPY)).toMatch(/No encontramos/);
  });
});
