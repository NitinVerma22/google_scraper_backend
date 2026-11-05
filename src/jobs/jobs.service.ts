import * as ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
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

    const targetCount = dto.targetCount > 0 ? Math.min(dto.targetCount, 2000) : 60;
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

  async exportJobLeads(jobId: string, format: 'CSV' | 'XLSX') {
    const job = await this.prisma.collectionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const jobResults = await this.prisma.jobResult.findMany({
      where: { jobId },
      include: {
        businessRecord: true,
      },
      orderBy: {
        businessRecord: {
          reviewOpportunityScore: 'desc',
        },
      },
    });

    const records = jobResults.map((jr) => jr.businessRecord);

    const rows = records.map((rec) => ({
      'Business Name': rec.name || '',
      'Phone Number': rec.phone || rec.internationalPhone || '',
      'Rating': rec.rating !== null && rec.rating !== undefined ? rec.rating : '',
      'Total Reviews': rec.userRatingCount !== null && rec.userRatingCount !== undefined ? rec.userRatingCount : 0,
      'Opportunity Score': rec.reviewOpportunityScore !== null && rec.reviewOpportunityScore !== undefined ? rec.reviewOpportunityScore : '',
      'Lead Grade': rec.leadGrade || '',
      'Category': rec.primaryType || '',
      'Locality': rec.locality || '',
      'City': rec.city || '',
      'State': rec.state || '',
      'Postal Code': rec.postalCode || '',
      'Address': rec.formattedAddress || '',
      'Website': rec.website || 'No Website (Counter Only)',
      'Google Maps URL': rec.googleMapsUrl || '',
      'Business Status': rec.businessStatus || '',
    }));

    const sanitizedJobName = (job.name || 'collection')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    const timestamp = Date.now();
    const fileName = `${sanitizedJobName}_leads_${timestamp}.${format.toLowerCase()}`;

    if (format === 'CSV') {
      const csvString = stringify(rows, { header: true });
      const buffer = Buffer.from(csvString, 'utf-8');
      return {
        buffer,
        fileName,
        mimeType: 'text/csv',
        recordCount: records.length,
      };
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Collection Leads');

      worksheet.columns = [
        { header: 'Business Name', key: 'Business Name', width: 28 },
        { header: 'Phone Number', key: 'Phone Number', width: 18 },
        { header: 'Rating', key: 'Rating', width: 10 },
        { header: 'Total Reviews', key: 'Total Reviews', width: 14 },
        { header: 'Opportunity Score', key: 'Opportunity Score', width: 18 },
        { header: 'Lead Grade', key: 'Lead Grade', width: 14 },
        { header: 'Category', key: 'Category', width: 20 },
        { header: 'Locality', key: 'Locality', width: 18 },
        { header: 'City', key: 'City', width: 15 },
        { header: 'State', key: 'State', width: 15 },
        { header: 'Postal Code', key: 'Postal Code', width: 14 },
        { header: 'Address', key: 'Address', width: 40 },
        { header: 'Website', key: 'Website', width: 25 },
        { header: 'Google Maps URL', key: 'Google Maps URL', width: 35 },
        { header: 'Business Status', key: 'Business Status', width: 16 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      for (const row of rows) {
        worksheet.addRow(row);
      }

      const rawBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(rawBuffer);
      return {
        buffer,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        recordCount: records.length,
      };
    }
  }

}
