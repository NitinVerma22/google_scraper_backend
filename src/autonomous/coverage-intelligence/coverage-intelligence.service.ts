import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CoverageMetrics {
  totalCells: number;
  completedCells: number;
  pendingCells: number;
  underExploredCells: number;
  saturatedCells: number;
  failedCells: number;
  uniqueBusinesses: number;
  duplicateCount: number;
  duplicatePercentage: number;
  coveragePercentage: number;
  hotLeadsCount: number;
  warmLeadsCount: number;
  discoveryRateLeadsPerCall: number;
  estimatedCostUSD: number;
  totalApiCalls: number;
}

@Injectable()
export class CoverageIntelligenceService {
  private readonly logger = new Logger(CoverageIntelligenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recalculate accurate geographical and category coverage metrics for a job
   */
  async computeJobCoverage(jobId: string): Promise<CoverageMetrics> {
    const [job, cells, results] = await Promise.all([
      this.prisma.collectionJob.findUnique({
        where: { id: jobId },
        include: {
          apiUsageLogs: true,
        },
      }),
      this.prisma.geoCell.findMany({
        where: { jobId },
      }),
      this.prisma.jobResult.findMany({
        where: { jobId },
        include: {
          businessRecord: {
            select: {
              leadGrade: true,
              reviewOpportunityScore: true,
            },
          },
        },
      }),
    ]);

    if (!job) throw new Error(`Job ${jobId} not found`);

    const totalCells = cells.length;
    let completedCells = 0;
    let pendingCells = 0;
    let underExploredCells = 0;
    let saturatedCells = 0;
    let failedCells = 0;

    for (const cell of cells) {
      if (cell.status === 'COMPLETED') completedCells++;
      else if (cell.status === 'PENDING') pendingCells++;
      else if (cell.status === 'UNDER_EXPLORED') underExploredCells++;
      else if (cell.status === 'SATURATED') saturatedCells++;
      else if (cell.status === 'FAILED') failedCells++;
    }

    const uniqueBusinesses = results.length;
    const totalCalls = job.requestCount || 0;
    const estimatedCost = job.estimatedCost || 0;

    let hotCount = 0;
    let warmCount = 0;
    for (const r of results) {
      if (r.businessRecord?.leadGrade === 'HOT') hotCount++;
      else if (r.businessRecord?.leadGrade === 'WARM') warmCount++;
    }

    // Duplicate count estimation based on discovered vs matched
    const duplicateCount = Math.max(0, job.discoveredCount - uniqueBusinesses);
    const duplicatePercentage = job.discoveredCount > 0
      ? Number(((duplicateCount / job.discoveredCount) * 100).toFixed(1))
      : 0;

    const discoveryRate = totalCalls > 0
      ? Number((uniqueBusinesses / totalCalls).toFixed(2))
      : 0;

    // Real-world Coverage Score: 70% based on spatial cell exploration, 30% on target leads density
    const cellRatio = totalCells > 0 ? (completedCells + saturatedCells) / totalCells : 0;
    const targetLeadRatio = job.targetCount > 0 ? Math.min(1, uniqueBusinesses / job.targetCount) : 0;
    const coveragePercentage = Number(((cellRatio * 0.7 + targetLeadRatio * 0.3) * 100).toFixed(1));

    // Update job coverage score in DB
    await this.prisma.collectionJob.update({
      where: { id: jobId },
      data: {
        coverageScore: coveragePercentage,
      },
    });

    return {
      totalCells,
      completedCells,
      pendingCells,
      underExploredCells,
      saturatedCells,
      failedCells,
      uniqueBusinesses,
      duplicateCount,
      duplicatePercentage,
      coveragePercentage,
      hotLeadsCount: hotCount,
      warmLeadsCount: warmCount,
      discoveryRateLeadsPerCall: discoveryRate,
      estimatedCostUSD: estimatedCost,
      totalApiCalls: totalCalls,
    };
  }

  /**
   * Update individual cell status in database
   */
  async updateCellStatus(
    cellId: string,
    status: 'PENDING' | 'EXPLORING' | 'COMPLETED' | 'UNDER_EXPLORED' | 'SATURATED' | 'FAILED',
    discoveredDelta = 0,
    duplicateDelta = 0,
  ): Promise<void> {
    await this.prisma.geoCell.update({
      where: { id: cellId },
      data: {
        status,
        discoveredCount: { increment: discoveredDelta },
        duplicateCount: { increment: duplicateDelta },
        attempts: { increment: 1 },
        lastSearchedAt: new Date(),
      },
    });
  }
}
