import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BatchEvaluationInput {
  jobId: string;
  stage: string;
  currentStrategy: 'NEARBY_DISTANCE' | 'LOCALITY_TEXT' | 'GRANULAR_CATEGORY' | 'CONTEXTUAL_KEYWORD';
  currentCategory: string;
  currentLocality?: string;
  currentCellId?: string;
  resultsReceived: number;
  uniqueNewPlaceIds: number;
  duplicateCount: number;
  apiErrorOccurred: boolean;
  httpStatus?: number;
  totalUniqueCollected: number;
  targetCount: number;
  consecutiveLowYieldCount: number;
}

export interface AutonomousDecision {
  action:
    | 'CONTINUE_CURRENT_STRATEGY'
    | 'SWITCH_TO_LOCALITY_TEXT'
    | 'SWITCH_TO_NEARBY_DISTANCE'
    | 'CHANGE_CATEGORY'
    | 'CHANGE_SEARCH_KEYWORD'
    | 'SUBDIVIDE_GEOCELL'
    | 'SEARCH_NEIGHBOURING_LOCALITY'
    | 'RETRY_WITH_EXPONENTIAL_BACKOFF'
    | 'STOP_EXHAUSTED_STRATEGY'
    | 'COMPLETE_DISCOVERY';
  reason: string;
  recommendedNextCategory?: string;
  recommendedNextLocality?: string;
  shouldSubdivideCell?: boolean;
  retryDelayMs?: number;
}

@Injectable()
export class DiscoveryDecisionEngine {
  private readonly logger = new Logger(DiscoveryDecisionEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate batch outcome and autonomously formulate next operational step
   */
  async evaluateBatchAndDecide(input: BatchEvaluationInput): Promise<AutonomousDecision> {
    const duplicateRate = input.resultsReceived > 0
      ? (input.duplicateCount / input.resultsReceived) * 100
      : 0;

    let decision: AutonomousDecision;

    // Rule 1: Goal Met Check
    if (input.totalUniqueCollected >= input.targetCount) {
      decision = {
        action: 'COMPLETE_DISCOVERY',
        reason: `Target goal of ${input.targetCount} qualified leads fully achieved (${input.totalUniqueCollected} verified businesses in database).`,
      };
    }
    // Rule 2: API Error Retry with Backoff
    else if (input.apiErrorOccurred) {
      const isRateLimit = input.httpStatus === 429;
      const delay = isRateLimit ? 5000 : 2500;
      decision = {
        action: 'RETRY_WITH_EXPONENTIAL_BACKOFF',
        reason: `API returned HTTP ${input.httpStatus || 'network error'}. Applying ${delay}ms backoff with jitter before next query.`,
        retryDelayMs: delay,
      };
    }
    // Rule 3: High Duplicate Saturation (>70% duplicates) in Nearby Search -> Switch to Locality Text Search
    else if (duplicateRate >= 70 && input.currentStrategy === 'NEARBY_DISTANCE') {
      decision = {
        action: 'SWITCH_TO_LOCALITY_TEXT',
        reason: `High duplicate collision (${duplicateRate.toFixed(1)}%) in coordinate radius. Switching strategy to locality-based Text Search to trigger Google's sub-market indexing.`,
      };
    }
    // Rule 4: Consecutive Low Yield (<=1 new lead for 2 runs) -> Change Category
    else if (input.consecutiveLowYieldCount >= 2 && input.uniqueNewPlaceIds <= 1) {
      decision = {
        action: 'CHANGE_CATEGORY',
        reason: `Category "${input.currentCategory}" yield exhausted in current zone (${input.uniqueNewPlaceIds} new leads). Rotating to next high-priority local service sector.`,
      };
    }
    // Rule 5: Zero Results in Text Search -> Switch to Contextual Service Keyword
    else if (input.resultsReceived === 0 && input.currentStrategy === 'LOCALITY_TEXT') {
      decision = {
        action: 'CHANGE_SEARCH_KEYWORD',
        reason: `Generic search for "${input.currentCategory}" yielded 0 listings. Shifting to deep contextual keyword targeting specific micro-services.`,
      };
    }
    // Rule 6: Moderate Yield (3-10 leads) in dense cell -> Subdivide cell into 4 quadrants
    else if (input.uniqueNewPlaceIds >= 5 && input.uniqueNewPlaceIds <= 15 && input.currentCellId) {
      decision = {
        action: 'SUBDIVIDE_GEOCELL',
        reason: `Cell shows active commercial density with ${input.uniqueNewPlaceIds} leads discovered. Subdividing cell into 4 high-density quadrant sub-coordinates to penetrate narrow markets.`,
        shouldSubdivideCell: true,
      };
    }
    // Rule 7: High Locality Saturation -> Shift to Neighbouring Locality
    else if (duplicateRate >= 60 && input.currentStrategy === 'LOCALITY_TEXT') {
      decision = {
        action: 'SEARCH_NEIGHBOURING_LOCALITY',
        reason: `Locality "${input.currentLocality || 'current'}" saturated (${duplicateRate.toFixed(1)}% duplicates). Advancing to adjacent residential colony.`,
      };
    }
    // Rule 8: Healthy Discovery (>50% new leads) -> Continue current strategy
    else if (input.uniqueNewPlaceIds >= 2) {
      decision = {
        action: 'CONTINUE_CURRENT_STRATEGY',
        reason: `Healthy discovery velocity (${input.uniqueNewPlaceIds} unique new leads found). Continuing ${input.currentStrategy} in this geographical zone.`,
      };
    }
    // Rule 9: Default Fallback -> Rotate Strategy
    else {
      decision = {
        action: 'STOP_EXHAUSTED_STRATEGY',
        reason: `Query combinations in current scope exhausted. Advancing to next spatial coordinate cell.`,
      };
    }

    // Persist explainable decision in database
    await this.prisma.autonomousDecisionLog.create({
      data: {
        jobId: input.jobId,
        stage: input.stage,
        strategy: input.currentStrategy,
        locality: input.currentLocality,
        cellId: input.currentCellId,
        decision: decision.action,
        reason: decision.reason,
        metrics: {
          resultsReceived: input.resultsReceived,
          uniqueNewPlaceIds: input.uniqueNewPlaceIds,
          duplicateRate: Number(duplicateRate.toFixed(1)),
          totalUniqueCollected: input.totalUniqueCollected,
        },
      },
    });

    this.logger.log(`[Autonomous Decision] Job: ${input.jobId} -> Action: ${decision.action} | Reason: ${decision.reason}`);
    return decision;
  }
}
