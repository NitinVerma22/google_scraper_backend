import { CityDiscoveryPlanner, isPointInPolygon } from './city-discovery/city-discovery-planner.service';
import { GeoGridService } from './geo-grid/geo-grid.service';
import { LocalityIntelligenceService } from './locality-intelligence/locality-intelligence.service';
import { OpportunityScoringService } from './opportunity-scoring/opportunity-scoring.service';
import { DiscoveryDecisionEngine } from './decision-engine/decision-engine.service';
import { PricingConfigService } from './pricing/pricing-config.service';
import { DiscoveryMemoryService } from './memory/discovery-memory.service';

describe('Autonomous Hyperlocal Business Discovery Engine – Architecture Refinements', () => {
  let planner: CityDiscoveryPlanner;
  let geoGrid: GeoGridService;
  let localityIntel: LocalityIntelligenceService;
  let opportunityScorer: OpportunityScoringService;
  let decisionEngine: DiscoveryDecisionEngine;
  let pricingConfig: PricingConfigService;
  let discoveryMemory: DiscoveryMemoryService;

  beforeEach(() => {
    const mockGooglePlaces: any = {
      geocode: jest.fn().mockResolvedValue({ lat: 26.8467, lng: 80.9462 }),
    };
    const mockConfig: any = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'USD_INR_RATE') return '86.5';
        return undefined;
      }),
    };
    const mockPrisma: any = {
      geoCell: { createMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      autonomousDecisionLog: { create: jest.fn() },
      discoveryMemory: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      businessRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };

    planner = new CityDiscoveryPlanner(mockGooglePlaces);
    geoGrid = new GeoGridService(mockPrisma);
    localityIntel = new LocalityIntelligenceService();
    opportunityScorer = new OpportunityScoringService();
    decisionEngine = new DiscoveryDecisionEngine(mockPrisma);
    pricingConfig = new PricingConfigService(mockConfig);
    discoveryMemory = new DiscoveryMemoryService(mockPrisma);
  });

  describe('Refinement 1: City Boundary Polygon & Ray-Casting Clipper', () => {
    it('should correctly classify coordinates inside and outside Lucknow boundary polygon', async () => {
      const boundary = await planner.planCityCoverage('India', 'Uttar Pradesh', 'Lucknow');
      expect(boundary.boundaryPolygon).toBeDefined();
      expect(boundary.boundaryPolygon.length).toBeGreaterThanOrEqual(8);

      // Hazratganj (Central Lucknow) should be strictly inside
      const insidePoint = { lat: 26.8467, lng: 80.9462 };
      expect(isPointInPolygon(insidePoint, boundary.boundaryPolygon)).toBe(true);

      // Gomti Nagar Patrakarpuram should be inside
      const gomtiNagar = { lat: 26.8510, lng: 80.9980 };
      expect(isPointInPolygon(gomtiNagar, boundary.boundaryPolygon)).toBe(true);

      // Distant rural point (26.3°N, 80.3°E) outside municipal limits should be discarded
      const distantRuralPoint = { lat: 26.3000, lng: 80.3000 };
      expect(isPointInPolygon(distantRuralPoint, boundary.boundaryPolygon)).toBe(false);
    });

    it('should prune points outside the city polygon when generating the grid', async () => {
      const boundary = await planner.planCityCoverage('India', 'Uttar Pradesh', 'Lucknow');
      const cells = geoGrid.generateCityGrid(boundary, 2000);

      // All retained cells must strictly be inside the urban boundary polygon
      cells.forEach((cell) => {
        const isInside = isPointInPolygon({ lat: cell.centerLat, lng: cell.centerLng }, boundary.boundaryPolygon);
        expect(isInside).toBe(true);
      });
    });
  });

  describe('Refinement 4: Configurable Regional India SKU Pricing Service', () => {
    it('should calculate accurate costs in USD and localized INR', () => {
      const essentialsUSD = pricingConfig.getCostUSD('NEARBY_SEARCH_ESSENTIALS');
      const essentialsINR = pricingConfig.getCostINR('NEARBY_SEARCH_ESSENTIALS');

      expect(essentialsUSD).toBe(0.005);
      expect(essentialsINR).toBeCloseTo(0.43, 1);

      const proUSD = pricingConfig.getCostUSD('TEXT_SEARCH_PRO');
      const proINR = pricingConfig.getCostINR('TEXT_SEARCH_PRO');

      expect(proUSD).toBe(0.035);
      expect(proINR).toBeCloseTo(3.03, 1);
    });

    it('should dynamically update exchange rates and SKU overrides without restarting', () => {
      pricingConfig.updateRates({ inrExchangeRate: 90.0, nearbySearchEssentialsUSD: 0.004 });
      const inrCost = pricingConfig.getCostINR('NEARBY_SEARCH_ESSENTIALS');
      expect(inrCost).toBeCloseTo(0.36, 2);
    });
  });

  describe('Refinement 6: Persistent Discovery Memory Engine', () => {
    it('should generate a deterministic SHA-256 fingerprint for query deduplication', () => {
      const fp1 = discoveryMemory.generateFingerprint('Lucknow', 'NEARBY_DISTANCE', 'dental_clinic', 26.8467, 80.9462);
      const fp2 = discoveryMemory.generateFingerprint('Lucknow', 'NEARBY_DISTANCE', 'dental_clinic', 26.8467, 80.9462);
      const fpDiff = discoveryMemory.generateFingerprint('Lucknow', 'LOCALITY_TEXT', 'dental_clinic', 26.8467, 80.9462);

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fpDiff);
      expect(fp1).toHaveLength(64); // SHA-256 hex string
    });
  });

  describe('Refinement 3: Post-Discovery Lead Scoring & Distance Ranking Realism', () => {
    it('should score a small neighbourhood clinic with 12 reviews as a high-opportunity HOT lead', () => {
      const scored = opportunityScorer.scoreBusinessLead({
        name: 'Avadh Dental Care',
        rating: 4.1,
        userRatingCount: 12,
        phone: '+91 98390 55667',
        businessStatus: 'OPERATIONAL',
      });

      expect(scored.score).toBeGreaterThanOrEqual(80);
      expect(scored.leadGrade).toBe('HOT');
      expect(scored.whatsAppClickUrl).toBeDefined();
    });

    it('should score an established clinic with 250 reviews as low urgency', () => {
      const scored = opportunityScorer.scoreBusinessLead({
        name: 'Mega Chain Dental Hospital',
        rating: 4.9,
        userRatingCount: 250,
        phone: '+91 522 2233445',
        businessStatus: 'OPERATIONAL',
      });

      expect(scored.score).toBeLessThan(45);
      expect(scored.leadGrade).not.toBe('HOT');
    });
  });

  describe('Refinement 7: Adaptive Search Intelligence', () => {
    it('should recommend switching to locality text search on high duplicate saturation', async () => {
      const decision = await decisionEngine.evaluateBatchAndDecide({
        jobId: 'test-refinement-job',
        stage: 'SWEEP',
        currentStrategy: 'NEARBY_DISTANCE',
        currentCategory: 'hair_salon',
        resultsReceived: 20,
        uniqueNewPlaceIds: 2,
        duplicateCount: 18, // 90% duplicate rate
        apiErrorOccurred: false,
        totalUniqueCollected: 150,
        targetCount: 1000,
        consecutiveLowYieldCount: 0,
      });

      expect(decision.action).toBe('SWITCH_TO_LOCALITY_TEXT');
      expect(decision.reason).toContain('High duplicate collision');
    });
  });
});
