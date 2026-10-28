import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { GooglePlacesModule } from './google-places/google-places.module';
import { CollectorModule } from './collector/collector.module';
import { JobsModule } from './jobs/jobs.module';
import { BusinessesModule } from './businesses/businesses.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExportsModule } from './exports/exports.module';
import { LocationsModule } from './locations/locations.module';
import { UsageModule } from './usage/usage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuthModule,
    GooglePlacesModule,
    CollectorModule,
    JobsModule,
    BusinessesModule,
    DashboardModule,
    ExportsModule,
    LocationsModule,
    UsageModule,
  ],
})
export class AppModule {}
