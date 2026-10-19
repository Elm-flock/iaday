import { Module } from '@nestjs/common';
import { OkrsModule } from '../okrs/okrs.module';
import { AdaptationRequestsController } from './adaptation-requests.controller';
import { AdaptationRequestsService } from './adaptation-requests.service';

@Module({
  imports: [OkrsModule],
  controllers: [AdaptationRequestsController],
  providers: [AdaptationRequestsService],
  exports: [AdaptationRequestsService],
})
export class AdaptationRequestsModule {}
