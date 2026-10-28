import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GooglePlacesService } from './google-places.service';

@Module({
  imports: [ConfigModule],
  providers: [GooglePlacesService],
  exports: [GooglePlacesService],
})
export class GooglePlacesModule {}
