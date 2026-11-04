import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PlacesSkuRates {
  textSearchEssentialsUSD: number;
  textSearchProUSD: number;
  textSearchEnterpriseUSD: number;
  nearbySearchEssentialsUSD: number;
  nearbySearchProUSD: number;
  placeDetailsEssentialsUSD: number;
  placeDetailsProUSD: number;
  geocodingUSD: number;
  inrExchangeRate: number;
}

@Injectable()
export class PricingConfigService {
  private readonly logger = new Logger(PricingConfigService.name);

  // Default baseline rates for Google Places Platform (New) with India regional tier support
  private currentRates: PlacesSkuRates;

  constructor(private readonly configService: ConfigService) {
    const exchangeRate = Number(this.configService.get<string>('USD_INR_RATE') || 86.5);

    this.currentRates = {
      // Essentials tier: id, displayName, formattedAddress, location, types (~$0.005 / ~₹0.43)
      textSearchEssentialsUSD: Number(this.configService.get<string>('SKU_TEXT_SEARCH_ESSENTIALS') || 0.005),
      nearbySearchEssentialsUSD: Number(this.configService.get<string>('SKU_NEARBY_SEARCH_ESSENTIALS') || 0.005),
      placeDetailsEssentialsUSD: Number(this.configService.get<string>('SKU_PLACE_DETAILS_ESSENTIALS') || 0.005),

      // Pro tier: phone, website, rating, userRatingCount, regularOpeningHours (~$0.035 / ~₹3.02)
      textSearchProUSD: Number(this.configService.get<string>('SKU_TEXT_SEARCH_PRO') || 0.035),
      nearbySearchProUSD: Number(this.configService.get<string>('SKU_NEARBY_SEARCH_PRO') || 0.035),
      placeDetailsProUSD: Number(this.configService.get<string>('SKU_PLACE_DETAILS_PRO') || 0.017),

      // Enterprise tier: reviews, secondary hours (~$0.040)
      textSearchEnterpriseUSD: Number(this.configService.get<string>('SKU_TEXT_SEARCH_ENTERPRISE') || 0.040),

      // Geocoding (~$0.005 / ~₹0.43)
      geocodingUSD: Number(this.configService.get<string>('SKU_GEOCODING') || 0.005),

      inrExchangeRate: exchangeRate,
    };

    this.logger.log(`Initialized Places Pricing Engine with USD/INR Exchange Rate: ${this.currentRates.inrExchangeRate}`);
  }

  getRates(): PlacesSkuRates {
    return { ...this.currentRates };
  }

  updateRates(overrides: Partial<PlacesSkuRates>): PlacesSkuRates {
    this.currentRates = {
      ...this.currentRates,
      ...overrides,
    };
    this.logger.log(`Updated Places SKU pricing rates`);
    return this.getRates();
  }

  /**
   * Calculate call cost in USD
   */
  getCostUSD(
    callType:
      | 'TEXT_SEARCH_ESSENTIALS'
      | 'TEXT_SEARCH_PRO'
      | 'NEARBY_SEARCH_ESSENTIALS'
      | 'NEARBY_SEARCH_PRO'
      | 'PLACE_DETAILS_ESSENTIALS'
      | 'PLACE_DETAILS_PRO'
      | 'GEOCODING'
  ): number {
    switch (callType) {
      case 'TEXT_SEARCH_ESSENTIALS':
        return this.currentRates.textSearchEssentialsUSD;
      case 'TEXT_SEARCH_PRO':
        return this.currentRates.textSearchProUSD;
      case 'NEARBY_SEARCH_ESSENTIALS':
        return this.currentRates.nearbySearchEssentialsUSD;
      case 'NEARBY_SEARCH_PRO':
        return this.currentRates.nearbySearchProUSD;
      case 'PLACE_DETAILS_ESSENTIALS':
        return this.currentRates.placeDetailsEssentialsUSD;
      case 'PLACE_DETAILS_PRO':
        return this.currentRates.placeDetailsProUSD;
      case 'GEOCODING':
        return this.currentRates.geocodingUSD;
      default:
        return 0.005;
    }
  }

  /**
   * Calculate call cost in INR
   */
  getCostINR(
    callType:
      | 'TEXT_SEARCH_ESSENTIALS'
      | 'TEXT_SEARCH_PRO'
      | 'NEARBY_SEARCH_ESSENTIALS'
      | 'NEARBY_SEARCH_PRO'
      | 'PLACE_DETAILS_ESSENTIALS'
      | 'PLACE_DETAILS_PRO'
      | 'GEOCODING'
  ): number {
    const usd = this.getCostUSD(callType);
    return Number((usd * this.currentRates.inrExchangeRate).toFixed(2));
  }
}
