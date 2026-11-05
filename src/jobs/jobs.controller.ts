import { Response } from 'express';
import { Controller, Post, Get, Param, Query, Body, UseGuards, Sse, MessageEvent, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { JobsService, CreateJobDto } from './jobs.service';
import { CollectorService } from '../collector/collector.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Collection Jobs')
@Controller('api/v1/jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly collectorService: CollectorService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create and launch a new business collection job' })
  async createJob(@CurrentUser() user: any, @Body() dto: CreateJobDto) {
    return this.jobsService.createJob(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all collection jobs with pagination and status filter' })
  async getJobs(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
  ) {
    return this.jobsService.getJobs(user.id, parseInt(page, 10), parseInt(limit, 10), status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get details, parameters, and live counters for a specific job' })
  async getJobById(@Param('id') id: string) {
    return this.jobsService.getJobById(id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel an actively running collection job' })
  async cancelJob(@Param('id') id: string) {
    return this.jobsService.cancelJob(id);
  }

  @Post(':id/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry failed tasks of a collection job' })
  async retryJob(@Param('id') id: string) {
    return this.jobsService.retryJob(id);
  }

  @Sse(':id/events')
  @ApiOperation({ summary: 'Server-Sent Events endpoint for real-time live job updates' })
  streamJobEvents(@Param('id') id: string): Observable<MessageEvent> {
    return this.collectorService.getJobEventsStream(id).pipe(
      map((data) => ({
        data,
      } as MessageEvent)),
    );
  }

  @Get(':id/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Instantly download leads of a specific collection job as CSV or Excel' })
  async exportJobLeads(
    @Param('id') id: string,
    @Query('format') format: string = 'csv',
    @Res() res: Response,
  ) {
    const normFormat = (format || 'csv').toUpperCase() as 'CSV' | 'XLSX';
    const exportData = await this.jobsService.exportJobLeads(id, normFormat);
    res.setHeader('Content-Type', exportData.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.fileName}"`);
    res.setHeader('Content-Length', exportData.buffer.length);
    res.send(exportData.buffer);
  }

}
