import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EnqueueTaskDto {
  jobId: string;
  taskType:
    | 'CITY_DISCOVERY'
    | 'LOCALITY_DISCOVERY'
    | 'GRID_DISCOVERY'
    | 'NEARBY_SEARCH'
    | 'TEXT_SEARCH'
    | 'BUSINESS_ENRICHMENT'
    | 'COVERAGE_RETRY'
    | 'API_RETRY'
    | 'LEAD_SCORING';
  priority?: number;
  payload: any;
  delayMs?: number;
}

@Injectable()
export class DiscoveryQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(DiscoveryQueueService.name);
  private isShuttingDown = false;
  private readonly pausedJobs = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  onApplicationShutdown(signal?: string) {
    this.logger.log(`DiscoveryQueueService received shutdown signal (${signal}). Halting active worker leases.`);
    this.isShuttingDown = true;
  }

  /**
   * Pause execution for a specific job
   */
  pauseJob(jobId: string): void {
    this.pausedJobs.add(jobId);
    this.logger.log(`Job queue PAUSED for: ${jobId}`);
  }

  /**
   * Resume execution for a specific job
   */
  resumeJob(jobId: string): void {
    this.pausedJobs.delete(jobId);
    this.logger.log(`Job queue RESUMED for: ${jobId}`);
  }

  isJobPaused(jobId: string): boolean {
    return this.pausedJobs.has(jobId);
  }

  /**
   * Enqueue a new persistent task into MySQL
   */
  async enqueueTask(dto: EnqueueTaskDto) {
    const runAt = dto.delayMs ? new Date(Date.now() + dto.delayMs) : new Date();

    return this.prisma.collectionTask.create({
      data: {
        jobId: dto.jobId,
        taskType: dto.taskType,
        priority: dto.priority || 0,
        runAt,
        status: 'PENDING',
        payload: dto.payload,
      },
    });
  }

  /**
   * Batch enqueue multiple persistent tasks
   */
  async enqueueTasks(dtos: EnqueueTaskDto[]) {
    const data = dtos.map((dto) => ({
      jobId: dto.jobId,
      taskType: dto.taskType,
      priority: dto.priority || 0,
      runAt: dto.delayMs ? new Date(Date.now() + dto.delayMs) : new Date(),
      status: 'PENDING' as const,
      payload: dto.payload,
    }));

    return this.prisma.collectionTask.createMany({
      data,
    });
  }

  /**
   * Atomically claim the next eligible pending task for a job
   * Respects priority, scheduled runAt time, and lease timeouts
   */
  async claimNextTask(jobId: string, workerId = 'worker-1') {
    if (this.isShuttingDown || this.isJobPaused(jobId)) {
      return null;
    }

    // 1. Recover stale locks older than 5 minutes (crash recovery)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await this.prisma.collectionTask.updateMany({
      where: {
        jobId,
        status: 'PROCESSING',
        lockedAt: { lt: fiveMinutesAgo },
      },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
      },
    });

    // 2. Find highest priority task ready to run
    const candidate = await this.prisma.collectionTask.findFirst({
      where: {
        jobId,
        status: 'PENDING',
        runAt: { lte: new Date() },
      },
      orderBy: [
        { priority: 'desc' },
        { runAt: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    if (!candidate) return null;

    // 3. Atomically lock candidate task
    try {
      const locked = await this.prisma.collectionTask.update({
        where: {
          id: candidate.id,
          status: 'PENDING', // concurrency safety check
        },
        data: {
          status: 'PROCESSING',
          lockedAt: new Date(),
          lockedBy: workerId,
          attempts: { increment: 1 },
        },
      });
      return locked;
    } catch {
      // Another worker claimed it concurrently
      return null;
    }
  }

  /**
   * Mark task as COMPLETED with output result
   */
  async completeTask(taskId: string, result?: any) {
    return this.prisma.collectionTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        result: result || null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Mark task as FAILED or schedule intelligent retry with exponential backoff
   */
  async failOrRetryTask(taskId: string, errorMessage: string, errorCode?: string) {
    const task = await this.prisma.collectionTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    if (task.attempts < task.maxAttempts) {
      // Exponential backoff with jitter: 2^attempt * 1.5s + random(500ms)
      const backoffMs = Math.pow(2, task.attempts) * 1500 + Math.random() * 500;
      const nextRunAt = new Date(Date.now() + backoffMs);

      this.logger.warn(`Task ${taskId} (${task.taskType}) failed: ${errorMessage}. Scheduling retry #${task.attempts + 1} at ${nextRunAt.toISOString()}`);

      return this.prisma.collectionTask.update({
        where: { id: taskId },
        data: {
          status: 'PENDING', // ready for retry
          runAt: nextRunAt,
          errorMessage,
          errorCode: errorCode || 'RETRYABLE_ERROR',
          lockedAt: null,
          lockedBy: null,
        },
      });
    }

    // Max attempts exceeded -> hard fail
    this.logger.error(`Task ${taskId} (${task.taskType}) permanently FAILED after ${task.attempts} attempts: ${errorMessage}`);
    return this.prisma.collectionTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        errorMessage,
        errorCode: errorCode || 'MAX_ATTEMPTS_EXCEEDED',
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Re-queue all failed tasks for a collection job
   */
  async retryAllFailedTasks(jobId: string): Promise<number> {
    const res = await this.prisma.collectionTask.updateMany({
      where: {
        jobId,
        status: 'FAILED',
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        runAt: new Date(),
        errorMessage: null,
        errorCode: null,
      },
    });

    this.logger.log(`Re-queued ${res.count} failed tasks for job: ${jobId}`);
    return res.count;
  }

  /**
   * Count remaining pending or processing tasks for a job
   */
  async getPendingTaskCount(jobId: string): Promise<number> {
    return this.prisma.collectionTask.count({
      where: {
        jobId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
  }
}
