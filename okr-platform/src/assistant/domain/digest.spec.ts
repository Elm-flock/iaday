import {
  activeFactKeys,
  computeDigestFacts,
  factCount,
  todayInZone,
  type DigestInput,
} from './digest-facts';
import {
  allowedNumbers,
  checkFidelity,
  extractNumbers,
  isSummaryAcceptable,
  parseSummary,
  templateItemText,
  templateSummary,
  totalFacts,
  type DigestSummary,
} from './digest-fidelity';
import { FACT_PRIORITY } from './digest-facts';

const NOW = new Date('2026-10-18T15:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const empty = (): DigestInput => ({
  now: NOW,
  today: '2026-10-18',
  krs: [],
  cycles: [],
  drafts: [],
  usersWithoutTeam: [],
  teamsWithoutLead: [],
  adaptationsNeedingReview: 0,
  adaptationRequests: [],
  sensitiveChanges: [],
});

const kr = (over: Partial<DigestInput['krs'][number]> = {}): DigestInput['krs'][number] => ({
  krTitle: 'Bajar el tiempo',
  objectiveTitle: 'Mejorar soporte',
  ownerName: 'Juan Díaz',
  objectiveStatus: 'PUBLISHED',
  publishedAt: day(-30),
  lastCheckInAt: day(-20),
  cadence: 'WEEKLY',
  lastBand: 'GREEN',
  ...over,
});

describe('computeDigestFacts', () => {
  it('sin datos: todo en 0 y sin claves activas', () => {
    const f = computeDigestFacts(empty());
    expect(activeFactKeys(f)).toEqual([]);
    expect(totalFacts(f)).toBe(0);
    expect(f.adaptationRequestsOpen).toMatchObject({
      count: 0,
      overdueCount: 0,
      unassignedCount: 0,
    });
  });

  it('check-ins vencidos: usa la cadencia, solo PUBLISHED, ordena por atraso y limita ejemplos a 5', () => {
    const input = empty();
    input.krs = [
      kr({ krTitle: 'A', lastCheckInAt: day(-20) }), // semanal: venció hace 13 días
      kr({ krTitle: 'B', lastCheckInAt: day(-8) }), // venció hace 1
      kr({ krTitle: 'C', lastCheckInAt: day(-3) }), // al día
      kr({ krTitle: 'D', objectiveStatus: 'DRAFT', lastCheckInAt: day(-90) }), // borrador no vence
      kr({ krTitle: 'E', lastCheckInAt: null, publishedAt: day(-9) }), // sin check-in: desde la publicación
      kr({
        krTitle: 'F',
        lastCheckInAt:
          day(-7).getTime() < NOW.getTime()
            ? new Date(NOW.getTime() - 7 * 86_400_000 - 1000)
            : null,
      }),
      kr({ krTitle: 'G', lastCheckInAt: day(-30) }),
      kr({ krTitle: 'H', lastCheckInAt: day(-40) }),
    ];
    const f = computeDigestFacts(input);
    expect(f.overdueCheckIns.count).toBe(6);
    expect(f.overdueCheckIns.examples).toHaveLength(5);
    expect(f.overdueCheckIns.examples[0]).toMatchObject({ krTitle: 'H', daysOverdue: 33 });
    expect(f.overdueCheckIns.examples.map((e) => e.krTitle)).not.toContain('C');
    expect(f.overdueCheckIns.examples.every((e) => e.daysOverdue >= 1)).toBe(true);
  });

  it('KRs en rojo: último band RED de objetivos publicados', () => {
    const input = empty();
    input.krs = [
      kr({ krTitle: 'Z', lastBand: 'RED' }),
      kr({ krTitle: 'A', lastBand: 'RED' }),
      kr({ krTitle: 'B', lastBand: 'YELLOW' }),
      kr({ krTitle: 'C', lastBand: null }),
      kr({ krTitle: 'D', lastBand: 'RED', objectiveStatus: 'DRAFT' }),
    ];
    const f = computeDigestFacts(input);
    expect(f.krsInRed.count).toBe(2);
    expect(f.krsInRed.examples.map((e) => e.krTitle)).toEqual(['A', 'Z']);
  });

  it('ciclos: terminan en <= 14 días y ciclos a cerrar (ACTIVE con fecha pasada)', () => {
    const input = empty();
    input.cycles = [
      { name: 'Q4', status: 'ACTIVE', endDate: new Date('2026-10-28T00:00:00Z') },
      { name: 'Hoy', status: 'ACTIVE', endDate: new Date('2026-10-18T00:00:00Z') },
      { name: 'Lejos', status: 'ACTIVE', endDate: new Date('2026-12-31T00:00:00Z') },
      { name: 'Vencido', status: 'ACTIVE', endDate: new Date('2026-10-08T00:00:00Z') },
      { name: 'Borrador', status: 'DRAFT', endDate: new Date('2026-10-20T00:00:00Z') },
      { name: 'Cerrado', status: 'CLOSED', endDate: new Date('2026-09-01T00:00:00Z') },
    ];
    const f = computeDigestFacts(input);
    expect(f.cyclesEndingSoon.examples).toEqual([
      { cycleName: 'Hoy', endDate: '2026-10-18', daysLeft: 0 },
      { cycleName: 'Q4', endDate: '2026-10-28', daysLeft: 10 },
    ]);
    expect(f.cyclesToClose).toEqual({
      count: 1,
      examples: [{ cycleName: 'Vencido', endDate: '2026-10-08', daysPast: 10 }],
    });
  });

  it('borradores que no se pueden publicar (menos de 3 KRs o de 3 objetivos del owner)', () => {
    const input = empty();
    input.drafts = [
      { objectiveTitle: 'B', ownerName: 'x', krCount: 2, ownerObjectiveCount: 3 },
      { objectiveTitle: 'A', ownerName: 'x', krCount: 3, ownerObjectiveCount: 2 },
      { objectiveTitle: 'C', ownerName: 'x', krCount: 3, ownerObjectiveCount: 3 },
    ];
    const f = computeDigestFacts(input);
    expect(f.draftsNotPublishable.examples.map((e) => e.objectiveTitle)).toEqual(['A', 'B']);
  });

  it('solicitudes de adaptación: sin solicitante, con vencidas y sin asignar', () => {
    const input = empty();
    input.adaptationRequests = [
      {
        dueDate: day(-2),
        assigned: false,
        entityKind: 'OBJECTIVE',
        preferredFormat: 'LECTURA_FACIL',
      },
      { dueDate: day(5), assigned: true, entityKind: 'GENERAL', preferredFormat: 'AUDIO' },
    ];
    const f = computeDigestFacts(input);
    expect(f.adaptationRequestsOpen).toMatchObject({
      count: 2,
      overdueCount: 1,
      unassignedCount: 1,
    });
    expect(f.adaptationRequestsOpen.examples[0]).toMatchObject({
      entityKind: 'OBJECTIVE',
      daysLeft: -2,
    });
    expect(JSON.stringify(f)).not.toMatch(/requester|solicitante|subject/i);
  });

  it('cambios sensibles: solo las últimas 72 horas, del más nuevo al más viejo', () => {
    const input = empty();
    const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
    input.sensitiveChanges = [
      { action: 'USER_ROLE_CHANGED', actorName: 'Ana', entityLabel: 'Juan', at: at(80) },
      { action: 'USER_DEACTIVATED', actorName: 'Ana', entityLabel: 'Luis', at: at(2) },
      { action: 'KR_TARGET_CHANGED', actorName: 'Ana', entityLabel: 'KR', at: at(71) },
    ];
    const f = computeDigestFacts(input);
    expect(f.recentSensitiveChanges.count).toBe(2);
    expect(f.recentSensitiveChanges.examples[0].action).toBe('USER_DEACTIVATED');
  });

  it('usuarios sin equipo, equipos sin líder y adaptaciones por revisar pasan tal cual', () => {
    const input = empty();
    input.usersWithoutTeam = [{ userName: 'Eva' }];
    input.teamsWithoutLead = [{ teamName: 'Datos' }, { teamName: 'Ops' }];
    input.adaptationsNeedingReview = 3;
    const f = computeDigestFacts(input);
    expect(activeFactKeys(f)).toEqual([
      'usersWithoutTeam',
      'teamsWithoutLead',
      'adaptationsNeedingReview',
    ]);
    expect(factCount(f, 'teamsWithoutLead')).toBe(2);
  });

  it('todayInZone: respeta la zona y cae a UTC si es inválida', () => {
    const late = new Date('2026-10-19T01:30:00Z'); // en Buenos Aires todavía es 18
    expect(todayInZone(late, 'America/Argentina/Buenos_Aires')).toBe('2026-10-18');
    expect(todayInZone(late, 'UTC')).toBe('2026-10-19');
    expect(todayInZone(late, 'No/Existe')).toBe('2026-10-19');
  });
});

describe('fidelidad del resumen', () => {
  const facts = () => {
    const input = empty();
    input.krs = [kr({ krTitle: 'Bajar', lastCheckInAt: day(-20) })];
    input.cycles = [
      { name: 'Q4 2026', status: 'ACTIVE', endDate: new Date('2026-10-28T00:00:00Z') },
    ];
    input.usersWithoutTeam = [{ userName: 'Eva' }];
    return computeDigestFacts(input);
  };

  it('extractNumbers separa fechas y normaliza ceros', () => {
    expect(extractNumbers('Q4 2026-10-28 y 007')).toEqual(['4', '2026', '10', '28', '7']);
    expect(extractNumbers('sin números')).toEqual([]);
  });

  it('allowedNumbers: conteos, días, fechas, nombres y la cantidad de temas', () => {
    const allowed = allowedNumbers(facts());
    for (const n of ['1', '13', '2026', '28', '10', '4', '3', '14', '72'])
      expect(allowed.has(n)).toBe(true);
    expect(allowed.has('99')).toBe(false);
  });

  it('checkFidelity detecta números inventados', () => {
    expect(checkFidelity(['Hay 1 persona sin equipo'], facts())).toEqual({
      faithful: true,
      unknownNumbers: [],
    });
    expect(checkFidelity(['Hay 57 personas'], facts())).toEqual({
      faithful: false,
      unknownNumbers: ['57'],
    });
  });

  it('la plantilla es siempre fiel y respeta el orden de prioridad', () => {
    const f = facts();
    const t = templateSummary(f);
    expect(t.headline).toBe('Hay 3 temas para revisar hoy.');
    expect(t.items.map((i) => i.factKey)).toEqual([
      'overdueCheckIns',
      'cyclesEndingSoon',
      'usersWithoutTeam',
    ]);
    expect(isSummaryAcceptable(t, f)).toBe(true);
  });

  it('plantilla vacía y de un solo tema', () => {
    expect(templateSummary(computeDigestFacts(empty()))).toEqual({
      headline: 'No hay nada urgente hoy.',
      items: [],
    });
    const input = empty();
    input.usersWithoutTeam = [{ userName: 'Eva' }];
    expect(templateSummary(computeDigestFacts(input)).headline).toBe(
      'Hay 1 tema para revisar hoy.',
    );
  });

  it('templateItemText cubre cada clave, en singular y plural, sin números inventados', () => {
    const input = empty();
    input.krs = [
      kr({ krTitle: 'Uno', lastCheckInAt: day(-20), lastBand: 'RED' }),
      kr({ krTitle: 'Dos', lastCheckInAt: day(-20), lastBand: 'RED' }),
    ];
    input.cycles = [
      { name: 'A', status: 'ACTIVE', endDate: new Date('2026-10-20T00:00:00Z') },
      { name: 'B', status: 'ACTIVE', endDate: new Date('2026-10-22T00:00:00Z') },
      { name: 'C', status: 'ACTIVE', endDate: new Date('2026-10-01T00:00:00Z') },
      { name: 'D', status: 'ACTIVE', endDate: new Date('2026-10-02T00:00:00Z') },
    ];
    input.drafts = [
      { objectiveTitle: 'x', ownerName: 'y', krCount: 0, ownerObjectiveCount: 1 },
      { objectiveTitle: 'z', ownerName: 'y', krCount: 0, ownerObjectiveCount: 1 },
    ];
    input.usersWithoutTeam = [{ userName: 'a' }, { userName: 'b' }];
    input.teamsWithoutLead = [{ teamName: 'a' }, { teamName: 'b' }];
    input.adaptationsNeedingReview = 2;
    input.adaptationRequests = [
      { dueDate: day(-1), assigned: false, entityKind: 'X', preferredFormat: 'Y' },
    ];
    input.sensitiveChanges = [
      { action: 'USER_DEACTIVATED', actorName: 'a', entityLabel: 'b', at: day(0) },
      { action: 'USER_ROLE_CHANGED', actorName: 'a', entityLabel: 'b', at: day(0) },
    ];
    const plural = computeDigestFacts(input);
    const singular = computeDigestFacts({
      ...input,
      krs: [input.krs[0]],
      cycles: [input.cycles[0], input.cycles[2]],
      drafts: [input.drafts[0]],
      usersWithoutTeam: [input.usersWithoutTeam[0]],
      teamsWithoutLead: [input.teamsWithoutLead[0]],
      adaptationsNeedingReview: 1,
      sensitiveChanges: [input.sensitiveChanges[0]],
    });
    for (const f of [plural, singular]) {
      for (const key of FACT_PRIORITY.filter((k) => factCount(f, k) > 0)) {
        const text = templateItemText(key, f);
        expect(text.length).toBeGreaterThan(5);
        expect(checkFidelity([text], f).faithful).toBe(true);
      }
    }
    expect(templateItemText('cyclesToClose', plural)).toContain('ciclos ya terminaron');
    expect(templateItemText('cyclesToClose', singular)).toContain('falta cerrarlo');
  });

  describe('isSummaryAcceptable / parseSummary', () => {
    const f = facts();
    const good: DigestSummary = {
      headline: 'Hay 3 temas para revisar hoy.',
      items: [{ factKey: 'overdueCheckIns', text: '1 resultado clave vencido, con 13 días.' }],
    };
    it('acepta uno bueno', () => expect(isSummaryAcceptable(good, f)).toBe(true));
    it('rechaza clave sin novedades, repetida, o mal formada', () => {
      expect(isSummaryAcceptable({ ...good, items: [{ factKey: 'krsInRed', text: 'x' }] }, f)).toBe(
        false,
      );
      expect(isSummaryAcceptable({ ...good, items: [good.items[0], good.items[0]] }, f)).toBe(
        false,
      );
      expect(
        isSummaryAcceptable({ ...good, items: [{ factKey: 'nada' as never, text: 'x' }] }, f),
      ).toBe(false);
    });
    it('rechaza números inventados, textos vacíos o muy largos', () => {
      expect(isSummaryAcceptable({ ...good, headline: 'Hay 99 temas' }, f)).toBe(false);
      expect(isSummaryAcceptable({ ...good, headline: '' }, f)).toBe(false);
      expect(isSummaryAcceptable({ ...good, headline: 'a'.repeat(201) }, f)).toBe(false);
      expect(
        isSummaryAcceptable({ ...good, items: [{ factKey: 'overdueCheckIns', text: '' }] }, f),
      ).toBe(false);
      expect(
        isSummaryAcceptable(
          { ...good, items: [{ factKey: 'overdueCheckIns', text: 'a'.repeat(301) }] },
          f,
        ),
      ).toBe(false);
      expect(
        isSummaryAcceptable({ ...good, items: Array.from({ length: 9 }, () => good.items[0]) }, f),
      ).toBe(false);
    });
    it('parseSummary valida la forma', () => {
      expect(parseSummary(good)).toEqual(good);
      expect(parseSummary(null)).toBeNull();
      expect(parseSummary({ headline: 1, items: [] })).toBeNull();
      expect(parseSummary({ headline: 'x', items: [1] })).toBeNull();
      expect(parseSummary({ headline: 'x', items: [{ factKey: 1, text: 'a' }] })).toBeNull();
    });
  });
});
