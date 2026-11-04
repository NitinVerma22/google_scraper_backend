import { Injectable, Logger } from '@nestjs/common';

export interface OpportunityScoreResult {
  score: number;
  leadGrade: 'HOT' | 'WARM' | 'NURTURE' | 'DISQUALIFIED';
  reasoning: string;
  whatsAppClickUrl?: string;
  humanizedOpeningHours?: string;
}

@Injectable()
export class OpportunityScoringService {
  private readonly logger = new Logger(OpportunityScoringService.name);

  /**
   * Calculate QR Review Studio Lead Opportunity Score (0 to 100)
   * Designed specifically for small/medium businesses needing review boost or neutral feedback capture
   */
  scoreBusinessLead(business: {
    name: string;
    rating?: number | null;
    userRatingCount?: number | null;
    phone?: string | null;
    businessStatus?: string | null;
    primaryType?: string | null;
    openingHours?: any;
  }): OpportunityScoreResult {
    // Disqualify closed businesses immediately
    if (business.businessStatus === 'CLOSED_PERMANENTLY' || business.businessStatus === 'CLOSED_TEMPORARILY') {
      return {
        score: 0,
        leadGrade: 'DISQUALIFIED',
        reasoning: 'Business listing marked permanently or temporarily closed on Google Maps',
      };
    }

    const reviewCount = business.userRatingCount || 0;
    const rating = business.rating || 0;
    const phone = business.phone?.trim();

    let countScore = 0;
    let ratingScore = 0;
    let contactScore = 0;
    const reasons: string[] = [];

    // 1. Review Count Scoring (Max 50 points)
    if (reviewCount === 0) {
      countScore = 48;
      reasons.push('Zero reviews: High urgency to establish initial online credibility');
    } else if (reviewCount >= 1 && reviewCount <= 30) {
      countScore = 50;
      reasons.push('Prime target (1–30 reviews): Needs review standees & QR cards to build momentum');
    } else if (reviewCount >= 31 && reviewCount <= 75) {
      countScore = 40;
      reasons.push('Growth target (31–75 reviews): Active customer base, primed for review acceleration');
    } else if (reviewCount >= 76 && reviewCount <= 150) {
      countScore = 20;
      reasons.push('Moderate review count (76–150): Can benefit from automated feedback filtering');
    } else {
      countScore = 5;
      reasons.push('High review count (>150): Established brand with less acute sales urgency');
    }

    // 2. Star Rating Scoring (Max 30 points)
    if (rating === 0) {
      ratingScore = 20;
      reasons.push('Unrated listing');
    } else if (rating >= 3.0 && rating <= 4.2) {
      ratingScore = 30;
      reasons.push('Vulnerable rating (3.0–4.2): Eager for private QR feedback to shield against public 1-star reviews');
    } else if (rating > 4.2 && rating <= 4.6) {
      ratingScore = 25;
      reasons.push('Good rating (4.3–4.6): Looking to preserve reputation and overtake competitors');
    } else if (rating > 4.6 && reviewCount < 30) {
      ratingScore = 20;
      reasons.push('High rating with low sample size: Needs volume without dilution');
    } else if (rating > 4.7 && reviewCount > 100) {
      ratingScore = 5;
      reasons.push('Near-perfect score (>4.7 with 100+ reviews): Low perceived pain point');
    } else {
      ratingScore = 15;
      reasons.push(`Rating ${rating.toFixed(1)}`);
    }

    // 3. Contact Readiness (Max 20 points)
    if (phone && phone.length >= 7) {
      contactScore = 20;
      reasons.push('Direct contact phone number verified');
    } else {
      contactScore = 0;
      reasons.push('No direct contact phone number on listing');
    }

    const totalScore = Math.min(100, countScore + ratingScore + contactScore);

    // 4. Lead Grade Assignment
    let leadGrade: 'HOT' | 'WARM' | 'NURTURE' | 'DISQUALIFIED' = 'NURTURE';
    if (totalScore >= 80) {
      leadGrade = 'HOT';
    } else if (totalScore >= 60) {
      leadGrade = 'WARM';
    } else if (totalScore >= 40) {
      leadGrade = 'NURTURE';
    } else {
      leadGrade = 'DISQUALIFIED';
    }

    // 5. Generate direct WhatsApp Click-to-Chat URL
    let whatsAppClickUrl: string | undefined = undefined;
    if (phone) {
      const cleanPhone = phone.replace(/[^\d]/g, '');
      const fullPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12
        ? cleanPhone
        : cleanPhone.length === 10
        ? `91${cleanPhone}`
        : cleanPhone;

      const message = encodeURIComponent(
        `Hello ${business.name}, we noticed your Google profile has ${reviewCount} reviews (${rating.toFixed(1)}★). QR Review Studio helps local businesses capture genuine customer reviews right at the counter. May we share how it works?`
      );
      whatsAppClickUrl = `https://wa.me/${fullPhone}?text=${message}`;
    }

    // 6. Format Opening Hours
    const humanizedOpeningHours = this.humanizeOpeningHours(business.openingHours);

    return {
      score: totalScore,
      leadGrade,
      reasoning: reasons.join(' • '),
      whatsAppClickUrl,
      humanizedOpeningHours,
    };
  }

  private humanizeOpeningHours(hours: any): string | undefined {
    if (!hours) return undefined;
    if (Array.isArray(hours.weekdayDescriptions) && hours.weekdayDescriptions.length > 0) {
      // Pick representative weekdays and weekend
      return hours.weekdayDescriptions.slice(0, 3).join(' | ');
    }
    if (typeof hours === 'string') return hours;
    return undefined;
  }
}
