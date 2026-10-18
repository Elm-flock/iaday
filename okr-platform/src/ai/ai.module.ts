import { Module } from '@nestjs/common';
import { OkrsModule } from '../okrs/okrs.module';
import { AiAdminController } from './ai-admin.controller';
import { AiMetricsService } from './ai-metrics.service';
import { AiUserThrottlerGuard } from './ai-user-throttler.guard';
import { AiClient } from './ai.client';
import { AiConfig } from './ai.config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [OkrsModule],
  controllers: [AiController, AiAdminController],
  providers: [AiService, AiMetricsService, AiClient, AiConfig, AiUserThrottlerGuard],
  // El asistente de administración reutiliza el cliente HMAC, la config y el límite por usuario.
  exports: [AiClient, AiConfig, AiUserThrottlerGuard],
})
export class AiModule {}
