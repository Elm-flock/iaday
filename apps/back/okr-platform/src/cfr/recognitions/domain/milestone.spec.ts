import { isMilestone } from './milestone';

describe('isMilestone', () => {
  it('KR 0.7 -> hito', () => expect(isMilestone({ score: 0.7 }, null)).toBe(true));
  it('KR 0.69 -> no hito', () => expect(isMilestone({ score: 0.69 }, null)).toBe(false));
  it('objetivo CLOSED -> hito', () => expect(isMilestone(null, { status: 'CLOSED' })).toBe(true));
  it('objetivo PUBLISHED -> no hito', () =>
    expect(isMilestone(null, { status: 'PUBLISHED' })).toBe(false));
  it('sin link -> no hito', () => expect(isMilestone(null, null)).toBe(false));
  it('KR bajo pero objetivo CLOSED -> hito', () =>
    expect(isMilestone({ score: 0.1 }, { status: 'CLOSED' })).toBe(true));
});
