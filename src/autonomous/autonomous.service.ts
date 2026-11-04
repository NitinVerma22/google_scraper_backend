import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlacesService } from '../google-places/google-places.service';
import { CityDiscoveryPlanner } from './city-discovery/city-discovery-planner.service';
import { GeoGridService } from './geo-grid/geo-grid.service';
import { LocalityIntelligenceService } from './locality-intelligence/locality-intelligence.service';
import { SearchStrategiesService } from './search-strategies/search-strategies.service';
import { DiscoveryDecisionEngine } from './decision-engine/decision-engine.service';
import { DiscoveryQueueService } from './discovery-queue/discovery-queue.service';
import { OpportunityScoringService } from './opportunity-scoring/opportunity-scoring.service';
import { CoverageIntelligenceService, CoverageMetrics } from './coverage-intelligence/coverage-intelligence.service';
import { PricingConfigService } from './pricing/pricing-config.service';
import { DiscoveryMemoryService } from './memory/discovery-memory.service';

export interface AutonomousLiveUpdate {
  jobId: string;
  status: string;
  currentLocality?: string;
  currentCoordinate?: { lat: number; lng: number };
  currentCategory?: string;
  currentStrategy?: string;
  metrics: CoverageMetrics;
  recentDecision?: {
    action: string;
    reason: string;
    timestamp: string;
  };
  timestamp: string;
}

export interface DryRunSimulationResult {
  isDryRun: boolean;
  city: string;
  state?: string;
  country: string;
  polygonMetrics: {
    boundaryAreaKm2: number;
    polygonVerticesCount: number;
    retainedUrbanGridPoints: number;
  };
  localityCatalog: {
    totalCuratedLocalities: number;
    sampleLocalities: string[];
    granularGoogleTypesCount: number;
  };
  taskGraph: {
    plannedNearbySearchTasks: number;
    plannedLocalityTextTasks: number;
    plannedTotalTasks: number;
  };
  simulatedCostTiers: {
    lowCaseUSD: number;
    lowCaseINR: number;
    expectedUSD: number;
    expectedINR: number;
    highCaseUSD: number;
    highCaseINR: number;
    exchangeRate: number;
  };
  estimatedDurationMinutes: number;
  message: string;
}

@Injectable()
export class AutonomousService {
  private readonly logger = new Logger(AutonomousService.name);
  private readonly liveEventStreams = new Map<string, Subject<AutonomousLiveUpdate>>();
  private readonly activeWorkerLoops = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly cityPlanner: CityDiscoveryPlanner,
    private readonly geoGrid: GeoGridService,
    private readonly localityIntel: LocalityIntelligenceService,
    private readonly searchStrategies: SearchStrategiesService,
    private readonly decisionEngine: DiscoveryDecisionEngine,
    private readonly queueService: DiscoveryQueueService,
    private readonly opportunityScorer: OpportunityScoringService,
    private readonly coverageIntel: CoverageIntelligenceService,
    private readonly pricingConfig: PricingConfigService,
    private readonly discoveryMemory: DiscoveryMemoryService,
  ) {}

  /**
   * Subscribe to live SSE updates for an autonomous discovery job
   */
  getEventStream(jobId: string): Observable<AutonomousLiveUpdate> {
    if (!this.liveEventStreams.has(jobId)) {
      this.liveEventStreams.set(jobId, new Subject<AutonomousLiveUpdate>());
    }
    return this.liveEventStreams.get(jobId)!.asObservable();
  }

  private emitLiveUpdate(jobId: string, update: AutonomousLiveUpdate) {
    const stream = this.liveEventStreams.get(jobId);
    if (stream) {
      stream.next(update);
    }
  }

  /**
   * DRY-RUN PRE-FLIGHT SIMULATION
   * Computes polygon boundary, points-in-polygon clipping, task graph, and cost tiers with ZERO external API calls
   */
  async dryRunAutonomousDiscovery(
    country = 'India',
    state = 'Uttar Pradesh',
    city = 'Lucknow',
    targetCount = 1000,
    maxBudgetUSD = 25.0,
  ): Promise<DryRunSimulationResult> {
    this.logger.log(`Executing Pre-Flight Dry Run Simulation for: ${city}, ${state}`);

    const boundary = await this.cityPlanner.planCityCoverage(country, state, city);
    const cells = this.geoGrid.generateCityGrid(boundary, 2000);
    const localities = this.localityIntel.getLocalitiesForCity(city);
    const granularTypes = this.localityIntel.getGranularBusinessTypes();

    const plannedNearby = Math.min(cells.length, 60);
    const plannedLocality = Math.min(localities.length, 45);
    const totalPlannedTasks = plannedNearby + plannedLocality;

    const rates = this.pricingConfig.getRates();
    const rateINR = rates.inrExchangeRate;

    // Simulation cost tiers
    // Low: High DB cache hit rate (most leads already discovered)
    const lowCostUSD = Number((plannedNearby * rates.nearbySearchEssentialsUSD + plannedLocality * 0.4 * rates.textSearchProUSD).toFixed(2));
    // Expected: Standard discovery sweep with selective enrichment
    const expectedCostUSD = Number((plannedNearby * rates.nearbySearchEssentialsUSD + plannedLocality * rates.textSearchProUSD + (targetCount * 0.6 * rates.placeDetailsProUSD * 0.2)).toFixed(2));
    // High: Greenfield scan (zero cache hits, maximum details calls)
    const highCostUSD = Math.min(maxBudgetUSD, Number((expectedCostUSD * 1.5).toFixed(2)));

    return {
      isDryRun: true,
      city,
      state,
      country,
      polygonMetrics: {
        boundaryAreaKm2: boundary.estimatedAreaKm2,
        polygonVerticesCount: boundary.boundaryPolygon?.length || 0,
        retainedUrbanGridPoints: cells.length,
      },
      localityCatalog: {
        totalCuratedLocalities: localities.length,
        sampleLocalities: localities.slice(0, 8).map((l) => l.name),
        granularGoogleTypesCount: granularTypes.length,
      },
      taskGraph: {
        plannedNearbySearchTasks: plannedNearby,
        plannedLocalityTextTasks: plannedLocality,
        plannedTotalTasks: totalPlannedTasks,
      },
      simulatedCostTiers: {
        lowCaseUSD: lowCostUSD,
        lowCaseINR: Number((lowCostUSD * rateINR).toFixed(1)),
        expectedUSD: expectedCostUSD,
        expectedINR: Number((expectedCostUSD * rateINR).toFixed(1)),
        highCaseUSD: highCostUSD,
        highCaseINR: Number((highCostUSD * rateINR).toFixed(1)),
        exchangeRate: rateINR,
      },
      estimatedDurationMinutes: Math.round((totalPlannedTasks * 1.5) / 60) + 10,
      message: 'Pre-flight simulation complete. Verified polygon clipping and task graph. Zero external API calls made.',
    };
  }

  /**
   * START AUTONOMOUS DISCOVERY: 1-Click Execution
   */
  async startAutonomousDiscovery(
    userId: string,
    country = 'India',
    state = 'Uttar Pradesh',
    city = 'Lucknow',
    maxBudgetUSD = 25.0,
    targetCount = 1000,
    maxRuntimeMinutes = 120,
  ) {
    this.logger.log(`Starting Autonomous City Discovery for: ${city}, ${state}, ${country}`);

    // 1. Determine City Geometry & Polygon Boundaries
    const boundary = await this.cityPlanner.planCityCoverage(country, state, city);

    // 2. Create Autonomous Collection Job in Database
    const job = await this.prisma.collectionJob.create({
      data: {
        userId,
        name: `Autonomous Scan – ${city} (${targetCount} Leads Target)`,
        status: 'SEARCHING',
        isAutonomous: true,
        targetCount,
        maxBudgetUSD,
        maxRuntimeMinutes,
        locationConfig: {
          country,
          state,
          city,
          boundary,
        } as any,
        categoryConfig: {
          primaryCategory: 'hyperlocal_services',
          categories: ['dental_clinic', 'medical_lab', 'hair_salon', 'beauty_salon', 'restaurant', 'cafe', 'car_repair', 'bakery'],
        },
        selectedFields: ['name', 'phone', 'website', 'rating', 'userRatingCount', 'formattedAddress', 'openingHours'],
        startedAt: new Date(),
      },
    });

    // 3. Generate Overlapping Coordinate Grid Matrix with Point-in-Polygon Clipping
    const cells = this.geoGrid.generateCityGrid(boundary, 2000);
    await this.geoGrid.persistJobCells(job.id, cells);

    // 4. Retrieve Curated City Localities
    const localities = this.localityIntel.getLocalitiesForCity(city);
    const granularTypes = this.localityIntel.getGranularBusinessTypes();

    // 5. Enqueue Initial Multi-Strategy Tasks into Persistent Queue
    const initialTasks: any[] = [];

    // Stage A: Nearby Distance searches on top-density coordinate cells
    cells.slice(0, 30).forEach((cell, idx) => {
      const type = granularTypes[idx % granularTypes.length].type;
      initialTasks.push({
        jobId: job.id,
        taskType: 'NEARBY_SEARCH' as const,
        priority: 10,
        payload: {
          cellId: cell.cellIndex,
          lat: cell.centerLat,
          lng: cell.centerLng,
          radiusMeters: cell.radiusMeters,
          types: [type],
          categoryLabel: type,
        },
      });
    });

    // Stage B: Locality-based Text searches for prime residential colonies & markets
    localities.slice(0, 25).forEach((loc) => {
      const cat = loc.suggestedCategories[0] || 'dental_clinic';
      initialTasks.push({
        jobId: job.id,
        taskType: 'LOCALITY_DISCOVERY' as const,
        priority: 8,
        payload: {
          localityName: loc.name,
          categoryType: cat,
          categoryLabel: cat.replace(/_/g, ' '),
          approxCoord: { lat: loc.approxLat, lng: loc.approxLng },
        },
      });
    });

    await this.queueService.enqueueTasks(initialTasks);
    this.logger.log(`Enqueued ${initialTasks.length} initial discovery tasks in persistent queue for job: ${job.id}`);

    // 6. Launch Asynchronous Worker Loop
    this.triggerAutonomousWorkerLoop(job.id, maxBudgetUSD, maxRuntimeMinutes);

    return {
      jobId: job.id,
      cityName: city,
      totalCellsGenerated: cells.length,
      totalLocalitiesLoaded: localities.length,
      initialTasksQueued: initialTasks.length,
      status: 'SEARCHING',
    };
  }

  /**
   * Continuous Persistent Queue Worker Loop with Safety Guardrails & Memory Check
   */
  private triggerAutonomousWorkerLoop(jobId: string, maxBudgetUSD: number, maxRuntimeMinutes = 120): void {
    if (this.activeWorkerLoops.has(jobId)) return;
    this.activeWorkerLoops.add(jobId);

    setImmediate(async () => {
      try {
        await this.runWorkerLoop(jobId, maxBudgetUSD, maxRuntimeMinutes);
      } catch (err: any) {
        this.logger.error(`Autonomous worker encountered critical error on job ${jobId}: ${err.message}`);
      } finally {
        this.activeWorkerLoops.delete(jobId);
      }
    });
  }

  private async runWorkerLoop(jobId: string, maxBudgetUSD: number, maxRuntimeMinutes: number): Promise<void> {
    let consecutiveLowYieldCount = 0;
    const workerId = `worker-${process.pid}`;

    while (!this.queueService.isJobPaused(jobId)) {
      const job = await this.prisma.collectionJob.findUnique({
        where: { id: jobId },
        select: { status: true, estimatedCost: true, targetCount: true, matchedCount: true, startedAt: true },
      });

      if (!job || job.status === 'CANCELLED' || job.status === 'COMPLETED') {
        break;
      }

      // 1. Safety Guardrail: Budget Limit
      if (job.estimatedCost >= maxBudgetUSD) {
        this.logger.warn(`Job ${jobId} reached configured maximum budget ($${maxBudgetUSD.toFixed(2)}). Auto-pausing.`);
        await this.prisma.collectionJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETED' },
        });
        break;
      }

      // 2. Safety Guardrail: Maximum Runtime Limit
      if (job.startedAt) {
        const elapsedMinutes = (Date.now() - new Date(job.startedAt).getTime()) / 60000;
        if (elapsedMinutes >= maxRuntimeMinutes) {
          this.logger.warn(`Job ${jobId} reached max runtime limit (${maxRuntimeMinutes} mins). Auto-pausing.`);
          await this.prisma.collectionJob.update({
            where: { id: jobId },
            data: { status: 'COMPLETED' },
          });
          break;
        }
      }

      // 3. Atomically claim next task
      const task = await this.queueService.claimNextTask(jobId, workerId);
      if (!task) {
        const pendingCount = await this.queueService.getPendingTaskCount(jobId);
        if (pendingCount === 0) {
          this.logger.log(`All queue tasks completed for job ${jobId}. Finalizing discovery.`);
          await this.prisma.collectionJob.update({
            where: { id: jobId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const payload = task.payload as any;
      const strategyName = task.taskType === 'NEARBY_SEARCH' ? 'NEARBY_DISTANCE' : 'LOCALITY_TEXT';

      // 4. Pre-Query Check: Discovery Memory Guard
      const fingerprint = this.discoveryMemory.generateFingerprint(
        'Lucknow',
        strategyName,
        payload.categoryLabel || payload.types?.[0] || 'general',
        payload.lat,
        payload.lng,
        payload.localityName
      );

      const memoryCheck = await this.discoveryMemory.isQueryExhausted(fingerprint);
      if (memoryCheck.isExhausted) {
        this.logger.log(`Skipping query: ${memoryCheck.reason}`);
        await this.queueService.completeTask(task.id, { skippedByMemory: true });
        continue;
      }

      let strategyResult: any;
      let apiFailed = false;
      let httpStatus = 200;

      try {
        if (task.taskType === 'NEARBY_SEARCH' || task.taskType === 'GRID_DISCOVERY') {
          strategyResult = await this.searchStrategies.executeNearbyDistanceStrategy(
            payload.lat,
            payload.lng,
            payload.types || ['dental_clinic'],
            payload.radiusMeters || 1500,
          );
        } else if (task.taskType === 'LOCALITY_DISCOVERY' || task.taskType === 'TEXT_SEARCH') {
          strategyResult = await this.searchStrategies.executeLocalityTextStrategy(
            payload.localityName,
            payload.categoryLabel || 'clinic',
            'Lucknow',
            payload.approxCoord,
          );
        } else {
          strategyResult = await this.searchStrategies.executeContextualKeywordStrategy(
            payload.localityName || 'Lucknow',
            payload.categoryType || 'dental_clinic',
            payload.approxCoord,
          );
        }
      } catch (err: any) {
        apiFailed = true;
        httpStatus = err?.response?.status || 500;
        await this.queueService.failOrRetryTask(task.id, err.message, `HTTP_${httpStatus}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      // Log API Usage
      await this.prisma.apiUsageLog.create({
        data: {
          jobId,
          endpoint: strategyResult.strategyName,
          requestCount: strategyResult.requestCount,
          statusCode: httpStatus,
          estimatedCost: strategyResult.estimatedCost,
        },
      });

      // Two-Stage Processing & Deduplication against MySQL
      let uniqueNewCount = 0;
      let duplicateCount = 0;
      const returnedPlaceIds: string[] = [];

      for (const place of strategyResult.places) {
        returnedPlaceIds.push(place.id);

        const existing = await this.prisma.businessRecord.findUnique({
          where: { placeId: place.id },
        });

        if (existing) {
          duplicateCount++;
          await this.prisma.jobResult.upsert({
            where: {
              jobId_businessRecordId: {
                jobId,
                businessRecordId: existing.id,
              },
            },
            update: { processingStatus: 'COMPLETED' },
            create: {
              jobId,
              businessRecordId: existing.id,
              filterStatus: 'MATCHED',
              processingStatus: 'COMPLETED',
            },
          });
          continue;
        }

        // Net-New Business Discovered
        uniqueNewCount++;

        // Parse PIN code if available
        let postalCode: string | undefined = undefined;
        if (Array.isArray(place.addressComponents)) {
          const postalComp = place.addressComponents.find((c: any) => c.types?.includes('postal_code'));
          if (postalComp?.longText || postalComp?.shortText) {
            postalCode = postalComp.longText || postalComp.shortText;
          }
        }
        if (!postalCode && place.formattedAddress) {
          const pinMatch = place.formattedAddress.match(/\b(226\d{3})\b/);
          if (pinMatch) postalCode = pinMatch[1];
        }

        // Calculate QR Review Studio Opportunity Score
        const scoreResult = this.opportunityScorer.scoreBusinessLead({
          name: place.displayName?.text || 'Local Business',
          rating: place.rating,
          userRatingCount: place.userRatingCount,
          phone: place.nationalPhoneNumber,
          businessStatus: place.businessStatus,
          primaryType: place.primaryType,
        });

        const newRecord = await this.prisma.businessRecord.create({
          data: {
            placeId: place.id,
            name: place.displayName?.text || 'Local Business',
            primaryType: place.primaryType || payload.categoryLabel || 'local_business',
            types: place.types || [],
            formattedAddress: place.formattedAddress,
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            country: 'India',
            postalCode: postalCode || null,
            latitude: place.location?.latitude,
            longitude: place.location?.longitude,
            googleMapsUrl: place.googleMapsUri,
            rating: place.rating || null,
            userRatingCount: place.userRatingCount || null,
            phone: place.nationalPhoneNumber || null,
            internationalPhone: place.internationalPhoneNumber || null,
            website: place.websiteUri || null,
            businessStatus: place.businessStatus || 'OPERATIONAL',
            reviewOpportunityScore: scoreResult.score,
            leadGrade: scoreResult.leadGrade,
            locality: payload.localityName || null,
            discoverySource: strategyResult.strategyName,
          },
        });

        await this.prisma.jobResult.create({
          data: {
            jobId,
            businessRecordId: newRecord.id,
            filterStatus: 'MATCHED',
            processingStatus: 'COMPLETED',
          },
        });
      }

      // Record to Discovery Memory
      await this.discoveryMemory.recordMemory({
        city: 'Lucknow',
        localityId: payload.localityName,
        strategy: strategyResult.strategyName,
        latitude: payload.lat,
        longitude: payload.lng,
        category: payload.categoryLabel || payload.types?.[0] || 'general',
        returnedPlaceIds,
        uniqueNewCount,
        duplicateCount,
      });

      // Mark queue task completed
      await this.queueService.completeTask(task.id, {
        uniqueNewCount,
        duplicateCount,
        totalReturned: strategyResult.places.length,
      });

      // Update counters in CollectionJob
      await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: {
          discoveredCount: { increment: strategyResult.places.length },
          matchedCount: { increment: uniqueNewCount },
          requestCount: { increment: strategyResult.requestCount },
          estimatedCost: { increment: strategyResult.estimatedCost },
        },
      });

      if (uniqueNewCount <= 1) {
        consecutiveLowYieldCount++;
      } else {
        consecutiveLowYieldCount = 0;
      }

      // Evaluate Batch via Autonomous Decision Engine
      const decision = await this.decisionEngine.evaluateBatchAndDecide({
        jobId,
        stage: 'AUTONOMOUS_SWEEP',
        currentStrategy: strategyResult.strategyName,
        currentCategory: payload.categoryLabel || payload.types?.[0] || 'general',
        currentLocality: payload.localityName,
        currentCellId: payload.cellId?.toString(),
        resultsReceived: strategyResult.places.length,
        uniqueNewPlaceIds: uniqueNewCount,
        duplicateCount,
        apiErrorOccurred: apiFailed,
        httpStatus,
        totalUniqueCollected: (job.matchedCount || 0) + uniqueNewCount,
        targetCount: job.targetCount,
        consecutiveLowYieldCount,
      });

      // Execute Autonomous Decisions & Adaptive Quad-Tree Subdivision
      if ((decision.action === 'SUBDIVIDE_GEOCELL' || strategyResult.isCapacitySaturated) && payload.cellId) {
        const dbCell = await this.prisma.geoCell.findFirst({
          where: { jobId, cellIndex: Number(payload.cellId) },
        });
        if (dbCell) {
          const subCells = await this.geoGrid.subdivideCell(dbCell.id);
          const subTasks = subCells.map((sc) => ({
            jobId,
            taskType: 'NEARBY_SEARCH' as const,
            priority: 12,
            payload: {
              cellId: sc.cellIndex,
              lat: sc.centerLat,
              lng: sc.centerLng,
              radiusMeters: sc.radiusMeters,
              types: payload.types || ['dental_clinic'],
              categoryLabel: payload.categoryLabel,
            },
          }));
          await this.queueService.enqueueTasks(subTasks);
        }
      } else if (decision.action === 'SWITCH_TO_LOCALITY_TEXT') {
        const nextLocality = this.localityIntel.getLocalitiesForCity('Lucknow')[Math.floor(Math.random() * 20)];
        await this.queueService.enqueueTask({
          jobId,
          taskType: 'LOCALITY_DISCOVERY',
          priority: 9,
          payload: {
            localityName: nextLocality.name,
            categoryType: payload.categoryLabel || 'clinic',
            categoryLabel: payload.categoryLabel || 'clinic',
            approxCoord: { lat: nextLocality.approxLat, lng: nextLocality.approxLng },
          },
        });
      } else if (decision.action === 'COMPLETE_DISCOVERY') {
        await this.prisma.collectionJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        break;
      }

      // Compute latest coverage metrics & emit live update to dashboard
      const metrics = await this.coverageIntel.computeJobCoverage(jobId);
      this.emitLiveUpdate(jobId, {
        jobId,
        status: 'SEARCHING',
        currentLocality: payload.localityName || `Cell #${payload.cellId || 1}`,
        currentCoordinate: payload.lat && payload.lng ? { lat: payload.lat, lng: payload.lng } : payload.approxCoord,
        currentCategory: payload.categoryLabel || payload.types?.[0] || 'Service',
        currentStrategy: strategyResult.strategyName,
        metrics,
        recentDecision: {
          action: decision.action,
          reason: decision.reason,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  // --- Controls ---
  pauseDiscovery(jobId: string) {
    this.queueService.pauseJob(jobId);
    return { success: true, message: `Autonomous discovery paused for ${jobId}` };
  }

  resumeDiscovery(jobId: string) {
    this.queueService.resumeJob(jobId);
    this.triggerAutonomousWorkerLoop(jobId, 25.0);
    return { success: true, message: `Autonomous discovery resumed for ${jobId}` };
  }

  async stopDiscovery(jobId: string) {
    this.queueService.pauseJob(jobId);
    await this.prisma.collectionJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });
    return { success: true, message: `Autonomous discovery stopped for ${jobId}` };
  }

  async retryFailedTasks(jobId: string) {
    const reQueued = await this.queueService.retryAllFailedTasks(jobId);
    this.triggerAutonomousWorkerLoop(jobId, 25.0);
    return { success: true, count: reQueued, message: `Re-queued ${reQueued} failed tasks` };
  }

  async getDiscoveryStatus(jobId: string) {
    const job = await this.prisma.collectionJob.findUnique({
      where: { id: jobId },
      include: {
        geoCells: { take: 80 },
        decisionLogs: {
          take: 30,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const metrics = await this.coverageIntel.computeJobCoverage(jobId);

    return {
      job,
      metrics,
      cells: job.geoCells,
      recentDecisions: job.decisionLogs,
    };
  }
}
