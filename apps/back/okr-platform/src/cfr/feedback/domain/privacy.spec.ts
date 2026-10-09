import { canModifyFeedback, canViewFeedback } from './privacy';

const fb = { fromUserId: 'a', toUserId: 'b' };

describe('canViewFeedback (sin bypass por rol)', () => {
  it('emisor ve', () => expect(canViewFeedback('a', fb)).toBe(true));
  it('receptor ve', () => expect(canViewFeedback('b', fb)).toBe(true));
  it('tercero (ADMIN y LEADER incluidos: el rol ni se recibe) no ve', () =>
    expect(canViewFeedback('admin', fb)).toBe(false));
});

describe('canModifyFeedback', () => {
  it('solo el autor edita/borra', () => {
    expect(canModifyFeedback('a', fb)).toBe(true);
    expect(canModifyFeedback('b', fb)).toBe(false);
  });
});
