import { Module } from '@nestjs/common';
import { ObjectivesController } from './objectives.controller';
import { ObjectivesService } from './objectives.service';
import { OkrsAccess } from './okrs-access.service';

@Module({
  controllers: [ObjectivesController],
  providers: [ObjectivesService, OkrsAccess],
})
export class OkrsModule {}
