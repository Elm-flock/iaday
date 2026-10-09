import { Module } from '@nestjs/common';
import { OkrsModule } from '../okrs/okrs.module';
import { CheckInsController } from './check-ins.controller';
import { CheckInsService } from './check-ins.service';

@Module({
  imports: [OkrsModule],
  controllers: [CheckInsController],
  providers: [CheckInsService],
})
export class CheckInsModule {}
