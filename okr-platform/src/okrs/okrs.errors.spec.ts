import { okrDomainError } from './okrs.errors';

const status = (code: string) => okrDomainError({ code, message: 'm' }).getStatus();

describe('okrDomainError (convención de códigos HTTP)', () => {
  it.each([
    'ALIGNMENT_SELF_PARENT',
    'ALIGNMENT_CYCLE',
    'INVALID_MANUAL_SCORE',
    'INVALID_KR_RANGE',
    'KR_VALUES_REQUIRED',
    'KR_VALUES_NOT_ALLOWED',
  ])('%s -> 400', (code) => expect(status(code)).toBe(400));
  it.each(['OBJECTIVE_CLOSED', 'OBJECTIVE_FIELD_LOCKED', 'OBJECTIVE_NOT_DRAFT', 'CYCLE_CLOSED'])(
    '%s -> 409',
    (code) => expect(status(code)).toBe(409),
  );
  it.each([
    'OBJECTIVE_LIMIT_EXCEEDED',
    'KR_LIMIT_EXCEEDED',
    'MIN_OBJECTIVES_NOT_MET',
    'MIN_KRS_NOT_MET',
    'ALIGNMENT_PARENT_NOT_PUBLISHED',
    'CODIGO_DESCONOCIDO',
  ])('%s -> 422', (code) => expect(status(code)).toBe(422));

  it('incluye el código de dominio en el cuerpo', () =>
    expect(okrDomainError({ code: 'MIN_KRS_NOT_MET', message: 'faltan' }).getResponse()).toEqual({
      statusCode: 422,
      message: 'faltan',
      code: 'MIN_KRS_NOT_MET',
    }));
});
