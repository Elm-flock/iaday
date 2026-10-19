import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VALIDATION_PIPE_OPTIONS } from '../configure-app';
import { CreateCycleDto } from '../cycles/dto/cycle.dto';
import { CreateKeyResultDto, UpdateKeyResultDto } from '../okrs/dto/key-result-input.dto';
import { CreateObjectiveDto } from '../okrs/dto/objective.dto';
import { CreateTeamDto, SetMemberDto } from '../teams/dto/team.dto';
import { CreateUserDto } from '../users/dto/user.dto';
import type { ActionCall } from './domain/plan-to-dto';

const DTO_CLASSES = {
  CreateUserDto,
  CreateTeamDto,
  SetMemberDto,
  CreateCycleDto,
  CreateObjectiveDto,
  CreateKeyResultDto,
  UpdateKeyResultDto,
} as const;

export type ActionDtoResult = { ok: true; dto: object | null } | { ok: false; message: string };

/**
 * Misma validación que el ValidationPipe global (transform + whitelist + forbidNonWhitelisted), con las
 * mismas opciones exportadas por configure-app. Devuelve la instancia ya transformada (p. ej. con trim).
 */
export async function validateActionDto(call: ActionCall): Promise<ActionDtoResult> {
  if (!call.dtoName || !call.dto) return { ok: true, dto: null };
  const instance = plainToInstance(DTO_CLASSES[call.dtoName] as new () => object, call.dto);
  const errors = await validate(instance, {
    whitelist: VALIDATION_PIPE_OPTIONS.whitelist,
    forbidNonWhitelisted: VALIDATION_PIPE_OPTIONS.forbidNonWhitelisted,
  });
  if (errors.length === 0) return { ok: true, dto: instance };
  const detail = errors
    .flatMap((e) => Object.values(e.constraints ?? {}))
    .slice(0, 3)
    .join('; ');
  return { ok: false, message: `Datos inválidos: ${detail}` };
}
