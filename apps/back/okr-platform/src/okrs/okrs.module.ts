import { Module } from '@nestjs/common';
import { KeyResultsController } from './key-results.controller';
import { KeyResultsService } from './key-results.service';
import { ObjectivesController } from './objectives.controller';
import { ObjectivesService } from './objectives.service';
import { OkrsAccess } from './okrs-access.service';

@Module({
  controllers: [ObjectivesController, KeyResultsController],
  providers: [ObjectivesService, KeyResultsService, OkrsAccess],
  exports: [OkrsAccess, ObjectivesService, KeyResultsService],
})
export class OkrsModule {}
