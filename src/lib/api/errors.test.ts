import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage, unwrap } from './errors';

const res = (status: number) => new Response(null, { status });

describe('unwrap', () => {
  it('devuelve data', () => {
    expect(unwrap({ data: { a: 1 }, response: res(200) })).toEqual({ a: 1 });
  });

  it('lanza ApiError con status y body cuando no hay data', () => {
    const body = { message: 'Inválido' };
    try {
      unwrap({ error: body, response: res(422) });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).body).toBe(body);
    }
  });
});

describe('apiErrorMessage', () => {
  it('extrae el mensaje string o une un arreglo', () => {
    expect(apiErrorMessage(new ApiError(400, { message: 'Mal' }))).toBe('Mal');
    expect(apiErrorMessage(new ApiError(400, { message: ['a', 'b'] }))).toBe('a. b');
    expect(apiErrorMessage(new ApiError(500))).toBeUndefined();
  });
});
