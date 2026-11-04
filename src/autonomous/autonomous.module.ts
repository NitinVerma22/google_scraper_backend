import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GooglePlacesModule } from '../google-places/google-places.module';
import { AutonomousController } from './autonomous.controller';
import { AutonomousService } from './autonomous.service';
import { CityDiscoveryPlanner } from './city-discovery/city-discovery-planner.service';
import { GeoGridService } from './geo-grid/geo-grid.service';
import { LocalityIntelligenceService } from './locality-intelligence/locality-intelligence.service';
import { SearchStrategiesService } from './search-strategies/search-strategies.service';
import { DiscoveryDecisionEngine } from './decision-engine/decision-engine.service';
import { DiscoveryQueueService } from './discovery-queue/discovery-queue.service';
import { OpportunityScoringService } from './opportunity-scoring/opportunity-scoring.service';
import { CoverageIntelligenceService } from './coverage-intelligence/coverage-intelligence.service';
import { PricingConfigService } from './pricing/pricing-config.service';
import { DiscoveryMemoryService } from './memory/discovery-memory.service';

@Module({
  imports: [PrismaModule, GooglePlacesModule],
  controllers: [AutonomousController],
  providers: [
    AutonomousService,
    CityDiscoveryPlanner,
    GeoGridService,
    LocalityIntelligenceService,
    SearchStrategiesService,
    DiscoveryDecisionEngine,
    DiscoveryQueueService,
    OpportunityScoringService,
    CoverageIntelligenceService,
    PricingConfigService,
    DiscoveryMemoryService,
  ],
  exports: [AutonomousService, OpportunityScoringService, PricingConfigService, DiscoveryMemoryService],
})
export class AutonomousModule {}
