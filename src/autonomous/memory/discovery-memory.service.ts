import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

export interface RecordMemoryInput {
  city: string;
  localityId?: string;
  strategy: string;
  latitude?: number;
  longitude?: number;
  category: string;
  returnedPlaceIds: string[];
  uniqueNewCount: number;
  duplicateCount: number;
}

@Injectable()
export class DiscoveryMemoryService {
  private readonly logger = new Logger(DiscoveryMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministic SHA-256 hash identifying a unique search operation
   */
  generateFingerprint(
    city: string,
    strategy: string,
    category: string,
    lat?: number,
    lng?: number,
    localityId?: string
  ): string {
    const coordPart = lat && lng ? `${lat.toFixed(4)}_${lng.toFixed(4)}` : 'global';
    const locPart = localityId ? localityId.toLowerCase().trim() : 'no_locality';
    const raw = `${city.toLowerCase()}:${strategy}:${category.toLowerCase()}:${coordPart}:${locPart}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Check if a specific query has already been exhausted recently
   */
  async isQueryExhausted(fingerprint: string, maxAgeDays = 14): Promise<{ isExhausted: boolean; reason?: string }> {
    const memory = await this.prisma.discoveryMemory.findUnique({
      where: { queryFingerprint: fingerprint },
    });

    if (!memory) return { isExhausted: false };

    const daysSince = (Date.now() - new Date(memory.lastSearchAt).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince < maxAgeDays && (memory.searchStatus === 'EXHAUSTED' || memory.searchStatus === 'SATURATED')) {
      return {
        isExhausted: true,
        reason: `Discovery Memory: Query previously yielded ${memory.duplicatePercentage}% duplicates on ${new Date(memory.lastSearchAt).toLocaleDateString()}. Skipping to avoid redundant API cost.`,
      };
    }

    return { isExhausted: false };
  }

  /**
   * Record search outcome into persistent Discovery Memory
   */
  async recordMemory(input: RecordMemoryInput) {
    const fingerprint = this.generateFingerprint(
      input.city,
      input.strategy,
      input.category,
      input.latitude,
      input.longitude,
      input.localityId
    );

    const total = input.returnedPlaceIds.length;
    const duplicatePct = total > 0 ? Number(((input.duplicateCount / total) * 100).toFixed(1)) : 0;

    let status = 'ACTIVE';
    let nextAction = 'CONTINUE_SEARCH';

    if (total === 0) {
      status = 'EXHAUSTED';
      nextAction = 'CHANGE_KEYWORD_OR_CATEGORY';
    } else if (duplicatePct >= 75) {
      status = 'EXHAUSTED';
      nextAction = 'SWITCH_TO_LOCALITY_TEXT';
    } else if (duplicatePct >= 50) {
      status = 'SATURATED';
      nextAction = 'SUBDIVIDE_QUADRANTS';
    }

    const existing = await this.prisma.discoveryMemory.findUnique({
      where: { queryFingerprint: fingerprint },
    });

    const previousIds: string[] = existing && Array.isArray(existing.discoveredPlaceIds)
      ? (existing.discoveredPlaceIds as string[])
      : [];

    const mergedIds = Array.from(new Set([...previousIds, ...input.returnedPlaceIds]));

    return this.prisma.discoveryMemory.upsert({
      where: { queryFingerprint: fingerprint },
      update: {
        discoveredPlaceIds: mergedIds,
        uniqueResultCount: { increment: input.uniqueNewCount },
        duplicatePercentage: duplicatePct,
        lastSearchAt: new Date(),
        searchStatus: status,
        nextRecommendedAction: nextAction,
      },
      create: {
        city: input.city,
        localityId: input.localityId || null,
        strategy: input.strategy,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        category: input.category,
        queryFingerprint: fingerprint,
        discoveredPlaceIds: mergedIds,
        uniqueResultCount: input.uniqueNewCount,
        duplicatePercentage: duplicatePct,
        searchStatus: status,
        nextRecommendedAction: nextAction,
      },
    });
  }

  /**
   * Retrieve all unique Place IDs ever discovered in a target city
   */
  async getCityKnownPlaceIds(city: string): Promise<Set<string>> {
    const records = await this.prisma.businessRecord.findMany({
      where: { city },
      select: { placeId: true },
    });

    return new Set(records.map((r) => r.placeId));
  }
}
