import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageSummary() {
    const [totalLogs, costAgg, endpointStats, recentLogs] = await Promise.all([
      this.prisma.apiUsageLog.count(),
      this.prisma.apiUsageLog.aggregate({
        _sum: { estimatedCost: true, requestCount: true },
      }),
      this.prisma.apiUsageLog.groupBy({
        by: ['endpoint'],
        _count: { id: true },
        _sum: { estimatedCost: true, requestCount: true },
      }),
      this.prisma.apiUsageLog.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          job: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      totalRequests: costAgg._sum.requestCount || 0,
      totalEstimatedCostUSD: costAgg._sum.estimatedCost ? Number(costAgg._sum.estimatedCost.toFixed(4)) : 0.0,
      endpointBreakdown: endpointStats.map((e) => ({
        endpoint: e.endpoint,
        requests: e._sum.requestCount || 0,
        costUSD: e._sum.estimatedCost ? Number(e._sum.estimatedCost.toFixed(4)) : 0.0,
      })),
      recentLogs,
    };
  }
}
