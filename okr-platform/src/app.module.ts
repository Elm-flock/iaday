import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CheckInsModule } from './check-ins/check-ins.module';
import { FeedbackModule } from './cfr/feedback/feedback.module';
import { RecognitionsModule } from './cfr/recognitions/recognitions.module';
import { CyclesModule } from './cycles/cycles.module';
import { OkrsModule } from './okrs/okrs.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite general holgado; login/refresh declaran uno más estricto con @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    CyclesModule,
    OkrsModule,
    CheckInsModule,
    FeedbackModule,
    RecognitionsModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    // El orden importa: throttling -> autenticación -> autorización por rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
