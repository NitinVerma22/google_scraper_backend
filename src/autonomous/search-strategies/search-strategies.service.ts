import { Injectable, Logger } from '@nestjs/common';
import { GooglePlacesService, PlaceSearchResultItem } from '../../google-places/google-places.service';
import { PricingConfigService } from '../pricing/pricing-config.service';

export interface StrategyExecutionResult {
  strategyName: 'NEARBY_DISTANCE' | 'LOCALITY_TEXT' | 'GRANULAR_CATEGORY' | 'CONTEXTUAL_KEYWORD';
  places: PlaceSearchResultItem[];
  requestCount: number;
  estimatedCost: number;
  estimatedCostINR: number;
  isCapacitySaturated: boolean; // Indicates hit 20-result Google limit on Nearby Search
  targetLocality?: string;
  targetCategory?: string;
  targetCoordinate?: { lat: number; lng: number };
}

// Complete rich fields required by QR Review Studio
const FULL_DISCOVERY_FIELDS = [
  'name',
  'formattedAddress',
  'addressComponents',
  'latitude',
  'longitude',
  'types',
  'primaryType',
  'googleMapsUrl',
  'phone',
  'internationalPhone',
  'website',
  'rating',
  'userRatingCount',
  'openingHours',
  'businessStatus',
];

@Injectable()
export class SearchStrategiesService {
  private readonly logger = new Logger(SearchStrategiesService.name);

  constructor(
    private readonly googlePlaces: GooglePlacesService,
    private readonly pricingConfig: PricingConfigService,
  ) {}

  /**
   * Strategy A: Nearby Search with DISTANCE Ranking
   * Surfaces nearest neighbourhood entities without Google's review popularity bias.
   * Fetches phone number, website, rating, reviews, address components and status directly.
   */
  async executeNearbyDistanceStrategy(
    lat: number,
    lng: number,
    types: string[],
    radiusMeters = 1500,
  ): Promise<StrategyExecutionResult> {
    this.logger.log(`[Strategy A: Nearby Distance] Searching (${lat.toFixed(4)}, ${lng.toFixed(4)}) radius=${radiusMeters}m for types: [${types.join(', ')}]`);

    const result = await this.googlePlaces.searchPlacesNearby({
      latitude: lat,
      longitude: lng,
      radiusMeters,
      includedTypes: types,
      rankPreference: 'DISTANCE',
      maxResultCount: 20, // Strict Google Places API New ceiling
      selectedFields: FULL_DISCOVERY_FIELDS,
    });

    const costUSD = this.pricingConfig.getCostUSD('NEARBY_SEARCH_PRO');
    const costINR = this.pricingConfig.getCostINR('NEARBY_SEARCH_PRO');
    const isSaturated = result.places.length >= 20;

    return {
      strategyName: 'NEARBY_DISTANCE',
      places: result.places,
      requestCount: 1,
      estimatedCost: costUSD,
      estimatedCostINR: costINR,
      isCapacitySaturated: isSaturated,
      targetCoordinate: { lat, lng },
      targetCategory: types[0],
    };
  }

  /**
   * Strategy B: Locality-Based Text Search
   * Combines granular residential colonies and categories to trigger Google's locality index.
   * Surfaces small neighbourhood businesses in specific residential sectors and markets.
   */
  async executeLocalityTextStrategy(
    localityName: string,
    categoryLabel: string,
    cityName = 'Lucknow',
    coordBias?: { lat: number; lng: number },
  ): Promise<StrategyExecutionResult> {
    const query = `${categoryLabel} in ${localityName}, ${cityName}`;
    this.logger.log(`[Strategy B: Locality Text] Executing query: "${query}"`);

    const result = await this.googlePlaces.searchPlacesText({
      textQuery: query,
      location: coordBias ? { lat: coordBias.lat, lng: coordBias.lng, radiusMeters: 3000 } : undefined,
      maxResultCount: 20,
      selectedFields: FULL_DISCOVERY_FIELDS,
    });

    const costUSD = this.pricingConfig.getCostUSD('TEXT_SEARCH_PRO');
    const costINR = this.pricingConfig.getCostINR('TEXT_SEARCH_PRO');

    return {
      strategyName: 'LOCALITY_TEXT',
      places: result.places,
      requestCount: 1,
      estimatedCost: costUSD,
      estimatedCostINR: costINR,
      isCapacitySaturated: result.places.length >= 20,
      targetLocality: localityName,
      targetCategory: categoryLabel,
      targetCoordinate: coordBias,
    };
  }

  /**
   * Strategy C: Granular Category Spatial Search
   * Targets deep niche Google Places types (e.g. medical_lab, dental_clinic, car_repair)
   */
  async executeGranularCategoryStrategy(
    lat: number,
    lng: number,
    granularType: string,
    radiusMeters = 2000,
  ): Promise<StrategyExecutionResult> {
    this.logger.log(`[Strategy C: Granular Category] Type: ${granularType} at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

    const result = await this.googlePlaces.searchPlacesNearby({
      latitude: lat,
      longitude: lng,
      radiusMeters,
      includedTypes: [granularType],
      rankPreference: 'DISTANCE',
      maxResultCount: 20,
      selectedFields: FULL_DISCOVERY_FIELDS,
    });

    const costUSD = this.pricingConfig.getCostUSD('NEARBY_SEARCH_PRO');
    const costINR = this.pricingConfig.getCostINR('NEARBY_SEARCH_PRO');

    return {
      strategyName: 'GRANULAR_CATEGORY',
      places: result.places,
      requestCount: 1,
      estimatedCost: costUSD,
      estimatedCostINR: costINR,
      isCapacitySaturated: result.places.length >= 20,
      targetCategory: granularType,
      targetCoordinate: { lat, lng },
    };
  }

  /**
   * Strategy D: Alternate Contextual Keyword / Service Discovery
   * Avoids "best/top/popular" and uses specific operational service keywords
   */
  async executeContextualKeywordStrategy(
    locality: string,
    categoryType: string,
    coordBias?: { lat: number; lng: number },
  ): Promise<StrategyExecutionResult> {
    const contextualKeywordMap: Record<string, string[]> = {
      dental_clinic: ['root canal treatment clinic', 'teeth cleaning dental care', 'family dental clinic'],
      medical_lab: ['pathology blood test laboratory', 'diagnostic center report', 'health checkup lab'],
      hair_salon: ['unisex hair salon', 'hair cutting studio', 'barber shop'],
      beauty_salon: ['women beauty parlour', 'bridal makeup studio', 'skin care salon'],
      restaurant: ['family dining restaurant', 'thali restaurant', 'pure veg dining'],
      cafe: ['coffee shop snacks cafe', 'tea cafe lounge', 'bakery cafe'],
      car_repair: ['car denting painting workshop', 'multi brand car service center', 'two wheeler service'],
      bakery: ['custom cake bakery shop', 'fresh pastry bakery', 'bread biscuit bakery'],
    };

    const alternatives = contextualKeywordMap[categoryType] || ['local service store', 'specialist care center'];
    const selectedKeyword = alternatives[Math.floor(Math.random() * alternatives.length)];
    const query = `${selectedKeyword} in ${locality}, Lucknow`;

    this.logger.log(`[Strategy D: Contextual Keyword] Query: "${query}"`);

    const result = await this.googlePlaces.searchPlacesText({
      textQuery: query,
      location: coordBias ? { lat: coordBias.lat, lng: coordBias.lng, radiusMeters: 4000 } : undefined,
      maxResultCount: 20,
      selectedFields: FULL_DISCOVERY_FIELDS,
    });

    const costUSD = this.pricingConfig.getCostUSD('TEXT_SEARCH_PRO');
    const costINR = this.pricingConfig.getCostINR('TEXT_SEARCH_PRO');

    return {
      strategyName: 'CONTEXTUAL_KEYWORD',
      places: result.places,
      requestCount: 1,
      estimatedCost: costUSD,
      estimatedCostINR: costINR,
      isCapacitySaturated: result.places.length >= 20,
      targetLocality: locality,
      targetCategory: selectedKeyword,
      targetCoordinate: coordBias,
    };
  }
}
