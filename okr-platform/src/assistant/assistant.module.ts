import { Module } from '@nestjs/common';
import { AdaptationRequestsModule } from '../adaptation-requests/adaptation-requests.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { CyclesModule } from '../cycles/cycles.module';
import { OkrsModule } from '../okrs/okrs.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { AssistantAdminGuard } from './assistant-admin.guard';
import { AssistantCatalogService } from './assistant-catalog.service';
import { AssistantDigestService } from './assistant-digest.service';
import { AssistantExecutorService } from './assistant-executor.service';
import { AssistantQueryService } from './assistant-query.service';
import { AssistantRetentionService } from './assistant-retention.service';
import { AssistantUsageService } from './assistant-usage.service';
import { AssistantConfig } from './assistant.config';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { HelpIndexService } from './help-index.service';

/**
 * Asistente de administración (cambio asistente-admin-y-manuales). Solo ADMIN. El agente (HTTP+HMAC)
 * propone planes; este módulo los valida, los confirma y los ejecuta en proceso con los servicios existentes.
 */
@Module({
  imports: [
    AiModule,
    UsersModule,
    TeamsModule,
    CyclesModule,
    OkrsModule,
    AuditModule,
    AdaptationRequestsModule,
  ],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantExecutorService,
    AssistantDigestService,
    AssistantQueryService,
    AssistantCatalogService,
    AssistantRetentionService,
    AssistantUsageService,
    AssistantConfig,
    AssistantAdminGuard,
    HelpIndexService,
  ],
})
export class AssistantModule {}
