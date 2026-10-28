import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlacesService } from '../google-places/google-places.service';
import { JobStatusEnum, JobProgressUpdate, LocationConfig, CategoryConfig, FilterConfig } from '../common/types';

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);
  private readonly jobSubjects = new Map<string, Subject<JobProgressUpdate>>();
  private readonly activeJobCancellations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesService,
  ) {}

  /**
   * Get or create an SSE observable stream for real-time job monitoring
   */
  getJobEventsStream(jobId: string): Observable<JobProgressUpdate> {
    if (!this.jobSubjects.has(jobId)) {
      this.jobSubjects.set(jobId, new Subject<JobProgressUpdate>());
    }
    return this.jobSubjects.get(jobId)!.asObservable();
  }

  /**
   * Broadcast an update to all active SSE subscribers for a job
   */
  private emitProgress(update: JobProgressUpdate) {
    const subject = this.jobSubjects.get(update.jobId);
    if (subject) {
      subject.next(update);
    }
  }

  /**
   * Request cancellation of a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    this.activeJobCancellations.add(jobId);
    await this.prisma.collectionJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });
    this.emitProgress({
      jobId,
      status: JobStatusEnum.CANCELLED,
      stage: 'Cancelled by operator',
      discoveredCount: 0,
      processedCount: 0,
      matchedCount: 0,
      failedCount: 0,
      requestCount: 0,
      estimatedCost: 0,
      message: 'Job cancelled by user',
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  /**
   * Primary Job Execution Runner
   */
  async startJobExecution(jobId: string): Promise<void> {
    // Run asynchronously in background so endpoint returns immediately
    setImmediate(async () => {
      await this.processJob(jobId);
    });
  }

  private async processJob(jobId: string): Promise<void> {
    this.logger.log(`Starting background collection job: ${jobId}`);

    const job = await this.prisma.collectionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      this.logger.error(`Job ${jobId} not found`);
      return;
    }

    const locationConfig = job.locationConfig as unknown as LocationConfig;
    const categoryConfig = job.categoryConfig as unknown as CategoryConfig;
    const filterConfig = (job.filterConfig as unknown as FilterConfig) || {};
    const selectedFields = job.selectedFields || [];
    const targetCount = job.targetCount || 50;

    let discoveredCount = 0;
    let processedCount = 0;
    let matchedCount = 0;
    let failedCount = 0;
    let requestCount = 0;
    let totalCost = 0;

    try {
      // 1. Mark job as SEARCHING
      await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: {
          status: 'SEARCHING',
          startedAt: new Date(),
        },
      });

      this.emitProgress({
        jobId,
        status: JobStatusEnum.SEARCHING,
        stage: 'Searching Google Places API',
        discoveredCount,
        processedCount,
        matchedCount,
        failedCount,
        requestCount,
        estimatedCost: totalCost,
        percentage: 5,
        message: 'Resolving location coordinates and executing query',
        timestamp: new Date().toISOString(),
      });

      // 2. Resolve coordinates if necessary
      let coordinates: { lat: number; lng: number } | undefined;
      if (locationConfig.lat && locationConfig.lng) {
        coordinates = { lat: locationConfig.lat, lng: locationConfig.lng };
      } else {
        const queryAddress = [locationConfig.locality, locationConfig.city, locationConfig.state, locationConfig.country]
          .filter(Boolean)
          .join(', ');
        const geocodeRes = await this.googlePlaces.geocode(queryAddress || 'Global');
        if (geocodeRes) {
          coordinates = { lat: geocodeRes.lat, lng: geocodeRes.lng };
          requestCount++;
          totalCost += 0.005;
          await this.prisma.apiUsageLog.create({
            data: {
              jobId,
              endpoint: 'geocode',
              requestCount: 1,
              statusCode: 200,
              estimatedCost: 0.005,
            },
          });
        }
      }

      // Check cancellation
      if (this.activeJobCancellations.has(jobId)) return;

      const searchTerms: string[] = [];
      const primaryCat = categoryConfig.primaryCategory || 'business';
      const cityLocality = locationConfig.city || locationConfig.locality || '';
      const catName = primaryCat.replace(/_/g, ' ');
      searchTerms.push(`${catName} in ${cityLocality}`);
      searchTerms.push(`best ${catName} in ${cityLocality}`);
      searchTerms.push(`top ${catName} in ${cityLocality}`);
      searchTerms.push(`${catName} near ${cityLocality}`);

      if (categoryConfig.customKeywords && categoryConfig.customKeywords.length > 0) {
        for (const kw of categoryConfig.customKeywords) {
          searchTerms.push(`${kw} in ${cityLocality}`);
          searchTerms.push(`best ${kw} in ${cityLocality}`);
        }
      }

      const discoveredPlaceIds = new Set<string>();
      const candidatePlaces: any[] = [];

      // 4. Execute Searches with Pagination and Multi-Page Crawling
      for (const term of searchTerms) {
        if (this.activeJobCancellations.has(jobId)) return;
        if (discoveredPlaceIds.size >= targetCount) break;

        let pageToken: string | undefined = undefined;
        let pageCount = 0;
        const maxPages = Math.ceil(targetCount / 20) + 1;

        while (pageCount < maxPages && discoveredPlaceIds.size < targetCount) {
          if (this.activeJobCancellations.has(jobId)) return;
          pageCount++;

          try {
            const searchResult = await this.googlePlaces.searchPlacesText({
              textQuery: term,
              location: coordinates ? { lat: coordinates.lat, lng: coordinates.lng, radiusMeters: (locationConfig.radiusKm || 15) * 1000 } : undefined,
              selectedFields,
              maxResultCount: 20,
              pageToken,
            });

            requestCount++;
            totalCost += searchResult.estimatedCost;

            await this.prisma.apiUsageLog.create({
              data: {
                jobId,
                endpoint: 'places:searchText',
                requestCount: 1,
                statusCode: 200,
                estimatedCost: searchResult.estimatedCost,
              },
            });

            for (const place of searchResult.places) {
              if (!discoveredPlaceIds.has(place.id)) {
                discoveredPlaceIds.add(place.id);
                candidatePlaces.push(place);
              }
            }

            discoveredCount = candidatePlaces.length;

            this.emitProgress({
              jobId,
              status: JobStatusEnum.SEARCHING,
              stage: 'Discovered candidate listings',
              discoveredCount,
              processedCount,
              matchedCount,
              failedCount,
              requestCount,
              estimatedCost: totalCost,
              percentage: Math.min(Math.round((discoveredCount / targetCount) * 40), 40),
              message: `Discovered ${discoveredCount} unique listings from search queries`,
              timestamp: new Date().toISOString(),
            });

            // If Google returned a next page token and we still need more listings, continue paging
            if (searchResult.nextPageToken && discoveredPlaceIds.size < targetCount) {
              pageToken = searchResult.nextPageToken;
              // Brief delay for Google's pagination token initialization
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              break;
            }
          } catch (err: any) {
            failedCount++;
            this.logger.error(`Search failed for term "${term}" page ${pageCount}: ${err.message}`);
            break;
          }
        }
      }

      // 5. Stage: Fetching Details (if details fields were requested)
      const needsDetails = selectedFields.some((f) => ['phone', 'website', 'openingHours'].includes(f));
      
      await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: {
          status: 'FETCHING_DETAILS',
          discoveredCount,
          requestCount,
          estimatedCost: totalCost,
        },
      });

      this.emitProgress({
        jobId,
        status: JobStatusEnum.FETCHING_DETAILS,
        stage: 'Enriching with Place Details',
        discoveredCount,
        processedCount,
        matchedCount,
        failedCount,
        requestCount,
        estimatedCost: totalCost,
        percentage: 45,
        message: 'Fetching full contact information and opening hours',
        timestamp: new Date().toISOString(),
      });

      // 6. Stage: Applying Filters & Saving Results
      await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: { status: 'APPLYING_FILTERS' },
      });

      for (const candidate of candidatePlaces) {
        if (this.activeJobCancellations.has(jobId)) return;
        if (matchedCount >= targetCount) break;

        processedCount++;

        // Filter checks
        const rating = candidate.rating || 0;
        const reviewCount = candidate.userRatingCount || 0;
        const phone = candidate.nationalPhoneNumber || candidate.internationalPhoneNumber || null;
        const website = candidate.websiteUri || null;

        let passes = true;
        if (filterConfig.minRating !== undefined && rating < filterConfig.minRating) passes = false;
        if (filterConfig.maxRating !== undefined && rating > filterConfig.maxRating) passes = false;
        if (filterConfig.minReviews !== undefined && reviewCount < filterConfig.minReviews) passes = false;
        if (filterConfig.maxReviews !== undefined && reviewCount > filterConfig.maxReviews) passes = false;
        if (filterConfig.requirePhone && !phone) passes = false;
        if (filterConfig.requireWebsite && !website) passes = false;

        if (passes) {
          matchedCount++;
          
          // Upsert BusinessRecord in database
          const businessRecord = await this.prisma.businessRecord.upsert({
            where: { placeId: candidate.id },
            update: {
              name: candidate.displayName?.text || 'Business Listing',
              primaryType: candidate.primaryType || categoryConfig.primaryCategory,
              types: candidate.types || [],
              formattedAddress: candidate.formattedAddress,
              city: locationConfig.city || 'Lucknow',
              state: locationConfig.state || 'Uttar Pradesh',
              country: locationConfig.country || 'India',
              latitude: candidate.location?.latitude,
              longitude: candidate.location?.longitude,
              googleMapsUrl: candidate.googleMapsUri,
              rating: candidate.rating,
              userRatingCount: candidate.userRatingCount,
              phone: phone,
              internationalPhone: candidate.internationalPhoneNumber,
              website: website,
              businessStatus: candidate.businessStatus || 'OPERATIONAL',
              openingHours: candidate.regularOpeningHours || null,
              lastSeenAt: new Date(),
            },
            create: {
              placeId: candidate.id,
              name: candidate.displayName?.text || 'Business Listing',
              primaryType: candidate.primaryType || categoryConfig.primaryCategory,
              types: candidate.types || [],
              formattedAddress: candidate.formattedAddress,
              city: locationConfig.city || 'Lucknow',
              state: locationConfig.state || 'Uttar Pradesh',
              country: locationConfig.country || 'India',
              latitude: candidate.location?.latitude,
              longitude: candidate.location?.longitude,
              googleMapsUrl: candidate.googleMapsUri,
              rating: candidate.rating,
              userRatingCount: candidate.userRatingCount,
              phone: phone,
              internationalPhone: candidate.internationalPhoneNumber,
              website: website,
              businessStatus: candidate.businessStatus || 'OPERATIONAL',
              openingHours: candidate.regularOpeningHours || null,
            },
          });

          // Link to job results
          await this.prisma.jobResult.upsert({
            where: {
              jobId_businessRecordId: {
                jobId,
                businessRecordId: businessRecord.id,
              },
            },
            update: {
              filterStatus: 'MATCHED',
              processingStatus: 'COMPLETED',
            },
            create: {
              jobId,
              businessRecordId: businessRecord.id,
              filterStatus: 'MATCHED',
              processingStatus: 'COMPLETED',
            },
          });
        }

        // Emit live progress periodically
        const calcPercent = Math.min(50 + Math.round((processedCount / candidatePlaces.length) * 45), 98);
        this.emitProgress({
          jobId,
          status: JobStatusEnum.APPLYING_FILTERS,
          stage: 'Processing & saving listings',
          discoveredCount,
          processedCount,
          matchedCount,
          failedCount,
          requestCount,
          estimatedCost: totalCost,
          percentage: calcPercent,
          message: `Matched ${matchedCount} / ${targetCount} verified businesses`,
          timestamp: new Date().toISOString(),
        });
      }

      // 7. Mark Job Completed
      const finalStatus = failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
      await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          discoveredCount,
          processedCount,
          matchedCount,
          failedCount,
          requestCount,
          estimatedCost: totalCost,
          completedAt: new Date(),
        },
      });

      this.emitProgress({
        jobId,
        status: finalStatus as JobStatusEnum,
        stage: 'Job Completed',
        discoveredCount,
        processedCount,
        matchedCount,
        failedCount,
        requestCount,
        estimatedCost: totalCost,
        percentage: 100,
        message: `Successfully collected ${matchedCount} verified business leads`,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Job ${jobId} finished successfully with ${matchedCount} matched leads`);
    } catch (error: any) {
      this.logger.error(`Job ${jobId} failed: ${error.message}`, error.stack);
      await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      this.emitProgress({
        jobId,
        status: JobStatusEnum.FAILED,
        stage: 'Failed',
        discoveredCount,
        processedCount,
        matchedCount,
        failedCount: failedCount + 1,
        requestCount,
        estimatedCost: totalCost,
        percentage: 100,
        message: `Job failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.activeJobCancellations.delete(jobId);
    }
  }
}
