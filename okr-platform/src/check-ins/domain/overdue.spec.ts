import { isCheckInOverdue } from './overdue';

const DAY = 86_400_000;
const now = new Date('2026-10-30T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe('isCheckInOverdue', () => {
  it('semanal: hace 8 días -> vencido', () =>
    expect(isCheckInOverdue(ago(8), ago(30), 'WEEKLY', now)).toBe(true));
  it('semanal: hace exactamente 7 días -> no vencido (estricto)', () =>
    expect(isCheckInOverdue(ago(7), ago(30), 'WEEKLY', now)).toBe(false));
  it('sin check-in usa la fecha de publicación', () => {
    expect(isCheckInOverdue(null, ago(8), 'WEEKLY', now)).toBe(true);
    expect(isCheckInOverdue(null, ago(7), 'WEEKLY', now)).toBe(false);
  });
  it('quincenal 14 y mensual 30 días', () => {
    expect(isCheckInOverdue(ago(14), ago(60), 'BIWEEKLY', now)).toBe(false);
    expect(isCheckInOverdue(ago(15), ago(60), 'BIWEEKLY', now)).toBe(true);
    expect(isCheckInOverdue(ago(30), ago(60), 'MONTHLY', now)).toBe(false);
    expect(isCheckInOverdue(ago(31), ago(60), 'MONTHLY', now)).toBe(true);
  });
  it('check-in reciente -> no vencido', () =>
    expect(isCheckInOverdue(ago(0), ago(30), 'WEEKLY', now)).toBe(false));
  it('solo objetivos PUBLISHED pueden vencer', () => {
    expect(isCheckInOverdue(ago(100), ago(100), 'WEEKLY', now, 'CLOSED')).toBe(false);
    expect(isCheckInOverdue(ago(100), ago(100), 'WEEKLY', now, 'DRAFT')).toBe(false);
    expect(isCheckInOverdue(ago(100), ago(100), 'WEEKLY', now, 'PUBLISHED')).toBe(true);
  });
});
