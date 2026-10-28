import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { GOOGLE_PRICING, BASIC_SEARCH_FIELDS, DETAILS_ONLY_FIELDS } from '../common/types';

export interface PlaceSearchResultItem {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: any[];
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: any;
  currentOpeningHours?: any;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
}

export interface SearchPlacesOptions {
  textQuery: string;
  location?: { lat: number; lng: number; radiusMeters?: number };
  includedType?: string;
  maxResultCount?: number;
  pageToken?: string;
  selectedFields?: string[];
}

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly httpClient: AxiosInstance;
  private readonly apiKey: string;
  private readonly isMockMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
    const mockEnv = this.configService.get<string>('GOOGLE_MAPS_MOCK_MODE');
    this.isMockMode = mockEnv === 'true' || !this.apiKey;

    this.httpClient = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (this.isMockMode) {
      this.logger.warn('GooglePlacesService running in MOCK MODE (No valid Google Maps API Key or MOCK_MODE=true)');
    } else {
      this.logger.log('GooglePlacesService configured with official Google Maps API Key');
    }
  }

  isUsingMock(): boolean {
    return this.isMockMode;
  }

  /**
   * Builds the X-Goog-FieldMask header based on user-requested fields.
   * Keeps request costs minimal by only asking for requested fields.
   */
  buildFieldMask(selectedFields?: string[], isDetails = false): string {
    const defaultFields = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.types', 'places.primaryType'];
    if (!selectedFields || selectedFields.length === 0) {
      return isDetails ? 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours,businessStatus' : defaultFields.join(',');
    }

    const fieldMap: Record<string, string> = {
      name: 'displayName',
      formattedAddress: 'formattedAddress',
      addressComponents: 'addressComponents',
      latitude: 'location',
      longitude: 'location',
      types: 'types',
      primaryType: 'primaryType',
      googleMapsUrl: 'googleMapsUri',
      phone: 'nationalPhoneNumber',
      internationalPhone: 'internationalPhoneNumber',
      website: 'websiteUri',
      rating: 'rating',
      userRatingCount: 'userRatingCount',
      openingHours: 'regularOpeningHours',
      businessStatus: 'businessStatus',
      priceLevel: 'priceLevel',
    };

    const masked = new Set<string>();
    masked.add(isDetails ? 'id' : 'places.id');
    masked.add(isDetails ? 'displayName' : 'places.displayName');

    for (const field of selectedFields) {
      const apiField = fieldMap[field];
      if (apiField) {
        masked.add(isDetails ? apiField : `places.${apiField}`);
      }
    }

    return Array.from(masked).join(',');
  }

  /**
   * Estimate API cost for a collection job based on target count and selected fields
   */
  estimateJobCost(targetCount: number, selectedFields: string[]): { estimatedRequests: number; estimatedCostUSD: number; hasDetailsCalls: boolean } {
    // Each search request returns up to 20 results
    const searchRequests = Math.ceil(targetCount / 20);
    const hasDetails = selectedFields.some((f) => DETAILS_ONLY_FIELDS.includes(f) || ['phone', 'website', 'openingHours', 'rating', 'userRatingCount'].includes(f));
    
    // Base search pricing
    const searchRate = hasDetails ? GOOGLE_PRICING.TEXT_SEARCH_PRO : GOOGLE_PRICING.TEXT_SEARCH_ESSENTIALS;
    const searchCost = searchRequests * searchRate;

    // Details calls if needed
    const detailsRequests = hasDetails ? targetCount : 0;
    const detailsCost = detailsRequests * GOOGLE_PRICING.PLACE_DETAILS_PRO;

    const totalCost = Number((searchCost + detailsCost).toFixed(4));

    return {
      estimatedRequests: searchRequests + detailsRequests,
      estimatedCostUSD: totalCost,
      hasDetailsCalls: hasDetails,
    };
  }

  /**
   * Search Places using Google Places API (New) Text Search
   */
  async searchPlacesText(options: SearchPlacesOptions): Promise<{
    places: PlaceSearchResultItem[];
    nextPageToken?: string;
    estimatedCost: number;
    isMock: boolean;
  }> {
    if (this.isMockMode) {
      return this.mockTextSearch(options);
    }

    const fieldMask = this.buildFieldMask(options.selectedFields, false);
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const payload: any = {
      textQuery: options.textQuery,
      pageSize: Math.min(options.maxResultCount || 20, 20),
    };

    if (options.includedType) {
      payload.includedType = options.includedType;
    }

    if (options.location?.lat && options.location?.lng) {
      payload.locationBias = {
        circle: {
          center: {
            latitude: options.location.lat,
            longitude: options.location.lng,
          },
          radius: (options.location.radiusMeters || 10000),
        },
      };
    }

    if (options.pageToken) {
      payload.pageToken = options.pageToken;
    }

    const startTime = Date.now();
    try {
      const response = await this.executeWithRetry(() =>
        this.httpClient.post(url, payload, {
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
        }),
      );

      const places = response.data.places || [];
      const nextPageToken = response.data.nextPageToken;
      const cost = GOOGLE_PRICING.TEXT_SEARCH_PRO;

      return {
        places,
        nextPageToken,
        estimatedCost: cost,
        isMock: false,
      };
    } catch (error: any) {
      this.logger.error(`Google Places Text Search failed: ${error?.response?.data?.error?.message || error.message}`);
      throw error;
    }
  }

  /**
   * Fetch Place Details (New)
   */
  async getPlaceDetails(placeId: string, selectedFields?: string[]): Promise<{
    details: PlaceSearchResultItem;
    estimatedCost: number;
    isMock: boolean;
  }> {
    if (this.isMockMode) {
      return this.mockPlaceDetails(placeId);
    }

    const fieldMask = this.buildFieldMask(selectedFields, true);
    const url = `https://places.googleapis.com/v1/places/${placeId}`;

    try {
      const response = await this.executeWithRetry(() =>
        this.httpClient.get(url, {
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
        }),
      );

      return {
        details: response.data,
        estimatedCost: GOOGLE_PRICING.PLACE_DETAILS_PRO,
        isMock: false,
      };
    } catch (error: any) {
      this.logger.error(`Google Places Details failed for ${placeId}: ${error?.response?.data?.error?.message || error.message}`);
      throw error;
    }
  }

  /**
   * Geocode a location text (e.g., "Lucknow, Uttar Pradesh, India") to obtain lat/lng
   */
  async geocode(address: string): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
    if (this.isMockMode) {
      return {
        lat: 26.8467,
        lng: 80.9462,
        formattedAddress: address || 'Lucknow, Uttar Pradesh, India',
      };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`;
    try {
      const response = await this.httpClient.get(url);
      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          formattedAddress: result.formatted_address,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Geocoding failed for ${address}`, error);
      return null;
    }
  }

  /**
   * Retry with exponential backoff for transient errors
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;
        const status = error?.response?.status;
        const isTransient = status === 429 || status === 500 || status === 503 || error.code === 'ECONNRESET';
        
        if (!isTransient || attempt >= maxRetries) {
          throw error;
        }

        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        this.logger.warn(`API transient error (${status || error.code}), retrying attempt ${attempt}/${maxRetries} after ${Math.round(backoffMs)}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw new Error('Max retries exceeded');
  }

  // -------------------------------------------------------------
  // MOCK ENGINE FOR DEVELOPMENT & TESTING (ZERO CHARGES)
  // -------------------------------------------------------------
  private mockTextSearch(options: SearchPlacesOptions): {
    places: PlaceSearchResultItem[];
    nextPageToken?: string;
    estimatedCost: number;
    isMock: boolean;
  } {
    const query = options.textQuery.toLowerCase();
    const mockBusinesses: PlaceSearchResultItem[] = [
      {
        id: `mock_place_${Date.now()}_1`,
        displayName: { text: 'Apex Real Estate Consultants', languageCode: 'en' },
        formattedAddress: '14/2 Gomti Nagar Extension, Lucknow, UP 226010',
        types: ['real_estate_agency', 'point_of_interest', 'establishment'],
        primaryType: 'real_estate_agency',
        location: { latitude: 26.852, longitude: 80.992 },
        googleMapsUri: 'https://maps.google.com/?cid=1001',
        nationalPhoneNumber: '+91 522 4001234',
        internationalPhoneNumber: '+91 522 400 1234',
        websiteUri: 'https://apexrealestate.example.com',
        rating: 4.6,
        userRatingCount: 84,
        businessStatus: 'OPERATIONAL',
      },
      {
        id: `mock_place_${Date.now()}_2`,
        displayName: { text: 'Care Dental & Implant Clinic', languageCode: 'en' },
        formattedAddress: '88 Hazratganj Mall Avenue, Lucknow, UP 226001',
        types: ['dentist', 'health', 'point_of_interest'],
        primaryType: 'dentist',
        location: { latitude: 26.848, longitude: 80.947 },
        googleMapsUri: 'https://maps.google.com/?cid=1002',
        nationalPhoneNumber: '+91 522 2289900',
        internationalPhoneNumber: '+91 522 228 9900',
        websiteUri: 'https://caredental.example.com',
        rating: 4.9,
        userRatingCount: 192,
        businessStatus: 'OPERATIONAL',
      },
      {
        id: `mock_place_${Date.now()}_3`,
        displayName: { text: 'Urban Fitness Studio & Crossfit', languageCode: 'en' },
        formattedAddress: 'Plot 45, Aliganj Main Road, Lucknow, UP 226024',
        types: ['gym', 'health', 'point_of_interest'],
        primaryType: 'gym',
        location: { latitude: 26.884, longitude: 80.942 },
        googleMapsUri: 'https://maps.google.com/?cid=1003',
        nationalPhoneNumber: '+91 98390 11223',
        websiteUri: undefined,
        rating: 4.3,
        userRatingCount: 56,
        businessStatus: 'OPERATIONAL',
      },
      {
        id: `mock_place_${Date.now()}_4`,
        displayName: { text: 'The Royal Heritage Bistro & Cafe', languageCode: 'en' },
        formattedAddress: '12 Rana Pratap Marg, Hazratganj, Lucknow, UP 226001',
        types: ['restaurant', 'cafe', 'food'],
        primaryType: 'restaurant',
        location: { latitude: 26.851, longitude: 80.952 },
        googleMapsUri: 'https://maps.google.com/?cid=1004',
        nationalPhoneNumber: '+91 522 2617788',
        websiteUri: 'https://royalheritagebistro.example.com',
        rating: 4.7,
        userRatingCount: 420,
        businessStatus: 'OPERATIONAL',
      },
      {
        id: `mock_place_${Date.now()}_5`,
        displayName: { text: 'Horizon Tech Solutions & Systems', languageCode: 'en' },
        formattedAddress: 'Cyber Heights, Vibhuti Khand, Lucknow, UP 226010',
        types: ['point_of_interest', 'establishment'],
        primaryType: 'corporate_office',
        location: { latitude: 26.864, longitude: 81.002 },
        googleMapsUri: 'https://maps.google.com/?cid=1005',
        nationalPhoneNumber: undefined,
        websiteUri: 'https://horizontech.example.com',
        rating: 4.1,
        userRatingCount: 18,
        businessStatus: 'OPERATIONAL',
      },
      {
        id: `mock_place_${Date.now()}_6`,
        displayName: { text: 'City Health Multi-Speciality Clinic', languageCode: 'en' },
        formattedAddress: 'Sector B, Mahanagar, Lucknow, UP 226006',
        types: ['medical_clinic', 'health'],
        primaryType: 'medical_clinic',
        location: { latitude: 26.877, longitude: 80.954 },
        googleMapsUri: 'https://maps.google.com/?cid=1006',
        nationalPhoneNumber: '+91 522 2334455',
        websiteUri: undefined,
        rating: 4.4,
        userRatingCount: 65,
        businessStatus: 'OPERATIONAL',
      },
    ];

    return {
      places: mockBusinesses,
      nextPageToken: undefined,
      estimatedCost: 0.0,
      isMock: true,
    };
  }

  private mockPlaceDetails(placeId: string): {
    details: PlaceSearchResultItem;
    estimatedCost: number;
    isMock: boolean;
  } {
    return {
      details: {
        id: placeId,
        displayName: { text: 'Enriched Business Listing (Mock)', languageCode: 'en' },
        formattedAddress: 'Sample Business District, Sector 12, Lucknow, UP',
        nationalPhoneNumber: '+91 522 4567890',
        websiteUri: 'https://samplebusiness.example.com',
        rating: 4.5,
        userRatingCount: 110,
        businessStatus: 'OPERATIONAL',
        regularOpeningHours: {
          weekdayDescriptions: [
            'Monday: 9:00 AM – 8:00 PM',
            'Tuesday: 9:00 AM – 8:00 PM',
            'Wednesday: 9:00 AM – 8:00 PM',
            'Thursday: 9:00 AM – 8:00 PM',
            'Friday: 9:00 AM – 8:00 PM',
            'Saturday: 10:00 AM – 6:00 PM',
            'Sunday: Closed',
          ],
        },
      },
      estimatedCost: 0.0,
      isMock: true,
    };
  }
}
