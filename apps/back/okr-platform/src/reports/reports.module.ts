import { Module } from '@nestjs/common';
import { OkrsModule } from '../okrs/okrs.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ imports: [OkrsModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
