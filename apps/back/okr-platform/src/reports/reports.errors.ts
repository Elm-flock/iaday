import { HttpException, HttpStatus } from '@nestjs/common';

/** Misma forma que okrDomainError / cfrDomainError: { statusCode, message, code }. */
export function reportForbidden(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Solo un ADMIN o el líder del equipo puede ver su reporte',
      code: 'REPORT_FORBIDDEN',
    },
    HttpStatus.FORBIDDEN,
  );
}
