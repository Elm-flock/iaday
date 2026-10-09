import { Module } from '@nestjs/common';
import { OkrsModule } from '../../okrs/okrs.module';
import { RecognitionsController } from './recognitions.controller';
import { RecognitionsService } from './recognitions.service';

@Module({
  imports: [OkrsModule],
  controllers: [RecognitionsController],
  providers: [RecognitionsService],
})
export class RecognitionsModule {}
