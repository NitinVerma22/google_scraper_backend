import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectorService } from '../collector/collector.service';
import { GooglePlacesService } from '../google-places/google-places.service';

export interface CreateJobDto {
  name: string;
  locationConfig: {
    country: string;
    state?: string;
    city?: string;
    locality?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    customQuery?: string;
  };
  categoryConfig: {
    primaryCategory: string;
    categories: string[];
    customKeywords?: string[];
  };
  keywordConfig?: {
    keywords: string[];
    variations?: string[];
  };
  filterConfig?: {
    minRating?: number;
    maxRating?: number;
    minReviews?: number;
    maxReviews?: number;
    requirePhone?: boolean;
    requireWebsite?: boolean;
    openNow?: boolean;
    duplicateHandling?: 'SKIP' | 'UPDATE';
  };
  targetCount: number;
  selectedFields: string[];
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collectorService: CollectorService,
    private readonly googlePlaces: GooglePlacesService,
  ) {}

  async createJob(userId: string, dto: CreateJobDto) {
    if (!dto.name || !dto.locationConfig || !dto.categoryConfig) {
      throw new BadRequestException('Job name, location, and category configurations are required');
    }

    const targetCount = dto.targetCount > 0 ? Math.min(dto.targetCount, 500) : 60;
    const selectedFields = dto.selectedFields?.length > 0 ? dto.selectedFields : ['name', 'phone', 'website', 'rating', 'formattedAddress'];

    const costEstimate = this.googlePlaces.estimateJobCost(targetCount, selectedFields);
    const isMock = this.googlePlaces.isUsingMock();

    const job = await this.prisma.collectionJob.create({
      data: {
        userId,
        name: dto.name,
        status: 'PENDING',
        locationConfig: dto.locationConfig as any,
        categoryConfig: dto.categoryConfig as any,
        keywordConfig: dto.keywordConfig as any,
        filterConfig: dto.filterConfig as any,
        targetCount,
        selectedFields,
        isMockMode: isMock,
        estimatedCost: costEstimate.estimatedCostUSD,
      },
    });

    // Start background processing
    await this.collectorService.startJobExecution(job.id);

    return {
      ...job,
      costEstimate,
    };
  }

  async getJobs(userId: string, page = 1, limit = 10, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.collectionJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { jobResults: true },
          },
        },
      }),
      this.prisma.collectionJob.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getJobById(jobId: string) {
    const job = await this.prisma.collectionJob.findUnique({
      where: { id: jobId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { jobResults: true, apiUsageLogs: true } },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    // Get phone / website counts for this job
    const [withPhone, withWebsite, withoutWebsite] = await Promise.all([
      this.prisma.jobResult.count({
        where: {
          jobId,
          businessRecord: { phone: { not: null } },
        },
      }),
      this.prisma.jobResult.count({
        where: {
          jobId,
          businessRecord: { website: { not: null } },
        },
      }),
      this.prisma.jobResult.count({
        where: {
          jobId,
          businessRecord: { website: null },
        },
      }),
    ]);

    return {
      ...job,
      stats: {
        withPhone,
        withWebsite,
        withoutWebsite,
      },
    };
  }

  async cancelJob(jobId: string) {
    const job = await this.getJobById(jobId);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
      throw new BadRequestException(`Cannot cancel a job that is already ${job.status}`);
    }

    return this.collectorService.cancelJob(jobId);
  }

  async retryJob(jobId: string) {
    const job = await this.getJobById(jobId);
    await this.prisma.collectionJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        failedCount: 0,
        errorMessage: null,
      },
    });

    await this.collectorService.startJobExecution(jobId);
    return { success: true, message: 'Job retry initiated' };
  }
}
