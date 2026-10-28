import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { CollectorModule } from '../collector/collector.module';
import { GooglePlacesModule } from '../google-places/google-places.module';

@Module({
  imports: [CollectorModule, GooglePlacesModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
