import { Injectable, Logger } from '@nestjs/common';

export interface OpportunityScoreResult {
  score: number;
  leadGrade: 'HOT' | 'WARM' | 'NURTURE' | 'DISQUALIFIED';
  hasPhone: boolean;
  hasWebsite: boolean;
  isLowReviewCount: boolean;
  isVulnerableRating: boolean;
  isEstablishedPopular: boolean;
  reasoning: string;
  whatsAppClickUrl?: string;
  humanizedOpeningHours?: string;
}

@Injectable()
export class OpportunityScoringService {
  private readonly logger = new Logger(OpportunityScoringService.name);

  /**
   * Calculate QR Review Studio Lead Opportunity Score (0 to 100)
   * Specifically prioritized for:
   * 1. Small neighbourhood businesses (0–50 reviews).
   * 2. Businesses with vulnerable star rating (≤ 4.2★) needing feedback shielding.
   * 3. Contactable via direct Phone / WhatsApp.
   * 4. Businesses with NO website (Counter QR standees are their primary digital identity).
   * 5. Deprioritizes popular / established chains (>100 reviews).
   */
  scoreBusinessLead(business: {
    name: string;
    rating?: number | null;
    userRatingCount?: number | null;
    phone?: string | null;
    website?: string | null;
    businessStatus?: string | null;
    primaryType?: string | null;
    openingHours?: any;
  }): OpportunityScoreResult {
    // 0. Disqualify closed businesses immediately
    if (business.businessStatus === 'CLOSED_PERMANENTLY' || business.businessStatus === 'CLOSED_TEMPORARILY') {
      return {
        score: 0,
        leadGrade: 'DISQUALIFIED',
        hasPhone: false,
        hasWebsite: false,
        isLowReviewCount: false,
        isVulnerableRating: false,
        isEstablishedPopular: false,
        reasoning: 'Business listing marked permanently or temporarily closed on Google Maps',
      };
    }

    const reviewCount = business.userRatingCount !== null && business.userRatingCount !== undefined ? Number(business.userRatingCount) : 0;
    const rating = business.rating !== null && business.rating !== undefined ? Number(business.rating) : 0;
    const phone = business.phone?.trim();
    const website = business.website?.trim();

    const hasPhone = Boolean(phone && phone.length >= 7);
    const hasWebsite = Boolean(website && website.length >= 5);
    const isLowReviewCount = reviewCount <= 50;
    const isVulnerableRating = rating > 0 && rating <= 4.2;
    const isEstablishedPopular = reviewCount > 100;

    let countScore = 0;
    let ratingScore = 0;
    let contactScore = 0;
    let websiteBonusScore = 0;
    const reasons: string[] = [];

    // 1. Review Count Scoring (Max 45 points)
    // Priority: SMALL businesses with low reviews, NOT popular places with hundreds of reviews
    if (reviewCount === 0) {
      countScore = 45;
      reasons.push('0 Google Reviews: Urgent need to establish first social proof');
    } else if (reviewCount >= 1 && reviewCount <= 25) {
      countScore = 45;
      reasons.push(`Under-Reviewed (${reviewCount} reviews): Prime target for QR counter standees`);
    } else if (reviewCount >= 26 && reviewCount <= 60) {
      countScore = 35;
      reasons.push(`Moderate presence (${reviewCount} reviews): Growing local shop, primed for acceleration`);
    } else if (reviewCount >= 61 && reviewCount <= 100) {
      countScore = 20;
      reasons.push(`Established local business (${reviewCount} reviews)`);
    } else {
      // > 100 reviews: Highly popular or chain store - deprioritize
      countScore = 5;
      reasons.push(`High review count (${reviewCount} reviews): Established brand / popular venue`);
    }

    // 2. Star Rating Scoring (Max 30 points)
    // Priority: Lower / vulnerable ratings (≤ 4.2) that need private review filter shielding
    if (rating === 0) {
      ratingScore = 15;
      reasons.push('Unrated listing');
    } else if (rating >= 2.0 && rating <= 3.8) {
      ratingScore = 30;
      reasons.push(`Sub-optimal Rating (${rating.toFixed(1)}★): Urgent need for private QR feedback to stop public 1-stars`);
    } else if (rating > 3.8 && rating <= 4.2) {
      ratingScore = 28;
      reasons.push(`Vulnerable Rating (${rating.toFixed(1)}★): Needs positive review boost to cross 4.5★ threshold`);
    } else if (rating > 4.2 && rating <= 4.6 && reviewCount <= 50) {
      ratingScore = 22;
      reasons.push(`Good Rating (${rating.toFixed(1)}★) but low volume: Preserve reputation`);
    } else if (rating > 4.6 && reviewCount > 100) {
      // 4.8★ with 300 reviews has no pain point
      ratingScore = 5;
      reasons.push(`High rating (${rating.toFixed(1)}★) with strong social proof: Lower urgency`);
    } else {
      ratingScore = 15;
      reasons.push(`Rating: ${rating.toFixed(1)}★`);
    }

    // 3. Contact Readiness (Max 20 points)
    // QR Studio needs phone numbers for WhatsApp/Phone outreach
    if (hasPhone) {
      contactScore = 20;
      reasons.push('Phone Verified: WhatsApp / Calling Ready');
    } else {
      contactScore = 0;
      reasons.push('Missing Phone: Requires on-ground field visit');
    }

    // 4. Website Presence Analysis (Max 5 points)
    // Businesses WITHOUT a website rely 100% on their physical counter & Google Maps!
    if (!hasWebsite) {
      websiteBonusScore = 5;
      reasons.push('No Website: Physical counter only (Prime Standee Candidate)');
    } else {
      websiteBonusScore = 0;
      reasons.push('Has Website');
    }

    // Penalty for popular establishments
    let popularityPenalty = 0;
    if (isEstablishedPopular) {
      popularityPenalty = 20; // Deduct 20 points from big popular stores
    }

    const totalScore = Math.max(0, Math.min(100, countScore + ratingScore + contactScore + websiteBonusScore - popularityPenalty));

    // 5. Assign Actionable Lead Grade
    let leadGrade: 'HOT' | 'WARM' | 'NURTURE' | 'DISQUALIFIED' = 'NURTURE';
    if (totalScore >= 75 && hasPhone && reviewCount <= 75) {
      leadGrade = 'HOT'; // Small local business with phone, low reviews
    } else if (totalScore >= 55) {
      leadGrade = 'WARM';
    } else {
      leadGrade = 'NURTURE';
    }

    // 6. Generate direct WhatsApp Click-to-Chat URL
    let whatsAppClickUrl: string | undefined = undefined;
    if (phone) {
      const cleanPhone = phone.replace(/[^\d]/g, '');
      const fullPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12
        ? cleanPhone
        : cleanPhone.length === 10
        ? `91${cleanPhone}`
        : cleanPhone;

      const message = encodeURIComponent(
        `Hello ${business.name}, we noticed your Google profile has ${reviewCount} reviews (${rating > 0 ? `${rating.toFixed(1)}★` : 'Unrated'}). QR Review Studio helps local businesses get more 5-star reviews directly from customers at your counter. Can we share a quick demo?`
      );
      whatsAppClickUrl = `https://wa.me/${fullPhone}?text=${message}`;
    }

    // 7. Humanized Opening Hours
    const humanizedOpeningHours = this.humanizeOpeningHours(business.openingHours);

    return {
      score: totalScore,
      leadGrade,
      hasPhone,
      hasWebsite,
      isLowReviewCount,
      isVulnerableRating,
      isEstablishedPopular,
      reasoning: reasons.join(' • '),
      whatsAppClickUrl,
      humanizedOpeningHours,
    };
  }

  private humanizeOpeningHours(hours: any): string | undefined {
    if (!hours) return undefined;
    if (Array.isArray(hours.weekdayDescriptions) && hours.weekdayDescriptions.length > 0) {
      return hours.weekdayDescriptions.slice(0, 3).join(' | ');
    }
    if (typeof hours === 'string') return hours;
    return undefined;
  }
}
