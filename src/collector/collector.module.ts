import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { GooglePlacesModule } from '../google-places/google-places.module';

@Module({
  imports: [GooglePlacesModule],
  providers: [CollectorService],
  exports: [CollectorService],
})
export class CollectorModule {}
