import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function hostConJson() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function known(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
  ])('mapea %s -> %i', (code, httpStatus) => {
    const { host, status, json } = hostConJson();
    filter.catch(known(code), host);
    expect(status).toHaveBeenCalledWith(httpStatus);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: httpStatus }));
  });

  it('check_violation (P2010 con SQLSTATE 23514) -> 422', () => {
    const { host, status } = hostConJson();
    filter.catch(known('P2010', { code: '23514' }), host);
    expect(status).toHaveBeenCalledWith(422);
  });

  it('error desconocido de Prisma que menciona check constraint -> 422', () => {
    const { host, status } = hostConJson();
    filter.catch(
      new Prisma.PrismaClientUnknownRequestError('violates check constraint "x"', {
        clientVersion: 'test',
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(422);
  });

  it('no filtra detalles internos de Prisma en el mensaje', () => {
    const { host, json } = hostConJson();
    filter.catch(known('P2002', { target: ['email'] }), host);
    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).not.toMatch(/boom|prisma/i);
  });
});
