export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

export enum JobStatusEnum {
  PENDING = 'PENDING',
  SEARCHING = 'SEARCHING',
  FETCHING_DETAILS = 'FETCHING_DETAILS',
  APPLYING_FILTERS = 'APPLYING_FILTERS',
  SAVING_RESULTS = 'SAVING_RESULTS',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface LocationConfig {
  country: string;
  state?: string;
  city?: string;
  locality?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  customQuery?: string;
}

export interface CategoryConfig {
  primaryCategory: string;
  categories: string[];
  customKeywords?: string[];
}

export interface FilterConfig {
  minRating?: number;
  maxRating?: number;
  minReviews?: number;
  maxReviews?: number;
  requirePhone?: boolean;
  requireWebsite?: boolean;
  openNow?: boolean;
  duplicateHandling?: 'SKIP' | 'UPDATE';
}

export interface JobProgressUpdate {
  jobId: string;
  status: JobStatusEnum;
  stage: string;
  discoveredCount: number;
  processedCount: number;
  matchedCount: number;
  failedCount: number;
  requestCount: number;
  estimatedCost: number;
  percentage?: number;
  message?: string;
  timestamp: string;
}

// Google Maps Platform Places API (New) Pricing structure (per request USD)
export const GOOGLE_PRICING = {
  TEXT_SEARCH_ESSENTIALS: 0.005,
  TEXT_SEARCH_PRO: 0.035,
  TEXT_SEARCH_ENTERPRISE: 0.040,
  PLACE_DETAILS_ESSENTIALS: 0.005,
  PLACE_DETAILS_PRO: 0.017,
  PLACE_DETAILS_ENTERPRISE: 0.025,
  GEOCODING: 0.005,
  AUTOCOMPLETE: 0.00283,
};

// Basic Search fields vs Details fields
export const BASIC_SEARCH_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'location',
  'types',
  'primaryType',
  'googleMapsUri',
];

export const DETAILS_ONLY_FIELDS = [
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'currentOpeningHours',
  'rating',
  'userRatingCount',
  'priceLevel',
  'businessStatus',
];
