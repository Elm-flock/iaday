import { Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Roles } from '../../src/common/decorators/roles.decorator';

/** Controlador solo-test para ejercitar los guards y el filtro globales sin depender de otros módulos. */
@Controller('probe')
export class ProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('protected')
  protectedRoute() {
    return { ok: true };
  }

  @Roles('ADMIN')
  @Get('admin')
  adminRoute() {
    return { ok: true };
  }

  @Post('duplicate-email')
  async duplicateEmail() {
    const data = { email: 'dup@test.local', name: 'Dup', passwordHash: 'x' };
    await this.prisma.user.create({ data });
    await this.prisma.user.create({ data });
  }

  @Post('bad-cycle')
  async badCycle() {
    await this.prisma.cycle.create({
      data: {
        name: 'Malo',
        kind: 'ANNUAL',
        startDate: new Date('2026-12-31'),
        endDate: new Date('2026-01-01'),
      },
    });
  }
}
