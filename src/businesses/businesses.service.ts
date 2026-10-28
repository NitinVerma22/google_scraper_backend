import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface BusinessQueryDto {
  search?: string;
  placeId?: string;
  city?: string;
  state?: string;
  country?: string;
  category?: string;
  minRating?: number;
  maxRating?: number;
  minReviews?: number;
  maxReviews?: number;
  hasPhone?: boolean;
  hasWebsite?: boolean;
  jobId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBusinesses(query: BusinessQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { formattedAddress: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.placeId) {
      where.placeId = query.placeId;
    }

    if (query.city) {
      where.city = { equals: query.city, mode: 'insensitive' };
    }

    if (query.state) {
      where.state = { equals: query.state, mode: 'insensitive' };
    }

    if (query.country) {
      where.country = { equals: query.country, mode: 'insensitive' };
    }

    if (query.category) {
      where.OR = [
        { primaryType: { equals: query.category, mode: 'insensitive' } },
        { types: { has: query.category } },
      ];
    }

    if (query.minRating !== undefined || query.maxRating !== undefined) {
      where.rating = {};
      if (query.minRating !== undefined) where.rating.gte = Number(query.minRating);
      if (query.maxRating !== undefined) where.rating.lte = Number(query.maxRating);
    }

    if (query.minReviews !== undefined || query.maxReviews !== undefined) {
      where.userRatingCount = {};
      if (query.minReviews !== undefined) where.userRatingCount.gte = Number(query.minReviews);
      if (query.maxReviews !== undefined) where.userRatingCount.lte = Number(query.maxReviews);
    }

    if (query.hasPhone === true) {
      where.phone = { not: null };
    } else if (query.hasPhone === false) {
      where.phone = null;
    }

    if (query.hasWebsite === true) {
      where.website = { not: null };
    } else if (query.hasWebsite === false) {
      where.website = null;
    }

    if (query.jobId) {
      where.jobResults = {
        some: { jobId: query.jobId },
      };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const sortField = query.sortBy || 'createdAt';
    const sortDirection = query.sortOrder || 'desc';

    const [items, total] = await Promise.all([
      this.prisma.businessRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        include: {
          jobResults: {
            select: { jobId: true, job: { select: { name: true } } },
            take: 3,
          },
        },
      }),
      this.prisma.businessRecord.count({ where }),
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

  async getBusinessById(id: string) {
    const business = await this.prisma.businessRecord.findUnique({
      where: { id },
      include: {
        jobResults: {
          include: {
            job: {
              select: { id: true, name: true, createdAt: true, status: true },
            },
          },
        },
      },
    });

    if (!business) {
      throw new NotFoundException(`Business record with ID ${id} not found`);
    }

    return business;
  }

  async getSavedFilters(userId: string) {
    return this.prisma.savedFilter.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveFilter(userId: string, name: string, filterConfiguration: any) {
    return this.prisma.savedFilter.create({
      data: {
        userId,
        name,
        filterConfiguration,
      },
    });
  }

  async deleteFilter(userId: string, filterId: string) {
    return this.prisma.savedFilter.deleteMany({
      where: { id: filterId, userId },
    });
  }
}
