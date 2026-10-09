import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';

const CHECK_VIOLATION = '23514';

interface Mapped {
  status: number;
  message: string;
}

/**
 * Traduce errores de Prisma a respuestas HTTP sin filtrar detalles internos:
 * P2002 -> 409, P2003 -> 409, P2025 -> 404, check_violation (23514) -> 422.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ): void {
    const { status, message } = this.map(exception);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message, error: HttpStatus[status] });
  }

  private map(
    e: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError,
  ): Mapped {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          return { status: HttpStatus.CONFLICT, message: 'Ya existe un registro con esos datos' };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            message: 'La operación viola una relación con otro registro',
          };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, message: 'Recurso no encontrado' };
        case 'P2010':
          if ((e.meta as { code?: string } | undefined)?.code === CHECK_VIOLATION) {
            return this.checkViolation();
          }
      }
    } else if (/check constraint|23514/i.test(e.message)) {
      return this.checkViolation();
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor' };
  }

  private checkViolation(): Mapped {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: 'Los datos no cumplen una regla de integridad',
    };
  }
}
