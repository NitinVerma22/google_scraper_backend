import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(days = 30) {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);

    const [
      totalBusinesses,
      periodBusinesses,
      runningJobs,
      completedJobs,
      failedJobs,
      withPhone,
      withWebsite,
      withoutWebsite,
      withRating,
      reviewsAgg,
      costAgg,
    ] = await Promise.all([
      this.prisma.businessRecord.count(),
      this.prisma.businessRecord.count({ where: { createdAt: { gte: periodStart } } }),
      this.prisma.collectionJob.count({ where: { status: { in: ['SEARCHING', 'FETCHING_DETAILS', 'APPLYING_FILTERS'] } } }),
      this.prisma.collectionJob.count({ where: { status: 'COMPLETED' } }),
      this.prisma.collectionJob.count({ where: { status: 'FAILED' } }),
      this.prisma.businessRecord.count({ where: { phone: { not: null } } }),
      this.prisma.businessRecord.count({ where: { website: { not: null } } }),
      this.prisma.businessRecord.count({ where: { website: null } }),
      this.prisma.businessRecord.count({ where: { rating: { not: null } } }),
      this.prisma.businessRecord.aggregate({
        _sum: { userRatingCount: true },
        _avg: { rating: true },
      }),
      this.prisma.apiUsageLog.aggregate({
        _sum: { estimatedCost: true, requestCount: true },
      }),
    ]);

    return {
      totalBusinesses,
      periodBusinesses,
      runningJobs,
      completedJobs,
      failedJobs,
      withPhone,
      withWebsite,
      withoutWebsite,
      withRating,
      totalReviews: reviewsAgg._sum.userRatingCount || 0,
      averageRating: reviewsAgg._avg.rating ? Number(reviewsAgg._avg.rating.toFixed(2)) : 0,
      totalApiCostUSD: costAgg._sum.estimatedCost ? Number(costAgg._sum.estimatedCost.toFixed(4)) : 0.0,
      totalApiRequests: costAgg._sum.requestCount || 0,
    };
  }

  async getActivity() {
    // Recent jobs
    const recentJobs = await this.prisma.collectionJob.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        targetCount: true,
        matchedCount: true,
        failedCount: true,
        estimatedCost: true,
        isMockMode: true,
        createdAt: true,
        completedAt: true,
      },
    });

    // Breakdown by category
    const categoryGroup = await this.prisma.businessRecord.groupBy({
      by: ['primaryType'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 6,
    });

    const categoryDistribution = categoryGroup.map((c) => ({
      category: c.primaryType || 'Uncategorized',
      count: c._count.id,
    }));

    // Breakdown by country
    const countryGroup = await this.prisma.businessRecord.groupBy({
      by: ['country'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const countryDistribution = countryGroup.map((c) => ({
      country: c.country || 'Unknown',
      count: c._count.id,
    }));

    // Recent errors from jobs
    const recentErrors = await this.prisma.collectionJob.findMany({
      where: { errorMessage: { not: null } },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        errorMessage: true,
        status: true,
        updatedAt: true,
      },
    });

    return {
      recentJobs,
      categoryDistribution,
      countryDistribution,
      recentErrors,
    };
  }
}
