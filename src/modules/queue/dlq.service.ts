import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { DLQ_QUEUE_NAME } from './retry.config';
import { GtdJobData } from './interfaces';
import { RedisService } from './redis.service';
import { JobStatus } from '../../common';

export interface DlqJobData extends GtdJobData {
  originalJobId: string;
  failedAt: string;
  totalAttempts: number;
  lastError: {
    code: string;
    message: string;
  };
  errorHistory: Array<{
    attempt: number;
    error_code: string;
    error_message: string;
    timestamp: string;
  }>;
}

@Injectable()
export class DlqService implements OnModuleDestroy {
  private readonly logger = new Logger(DlqService.name);
  private readonly dlqQueue: Queue<DlqJobData>;

  constructor(private redisService: RedisService) {
    this.dlqQueue = new Queue(DLQ_QUEUE_NAME, {
      connection: this.redisService.getClient(),
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    this.logger.log(`DLQ "${DLQ_QUEUE_NAME}" initialized`);
  }

  async moveToDeadLetter(
    job: Job<GtdJobData>,
    lastError: { code: string; message: string },
    errorHistory: Array<{
      attempt: number;
      error_code: string;
      error_message: string;
      timestamp: string;
    }>,
  ): Promise<void> {
    const { jobId, deal_id, file_id, file_name } = job.data;

    this.logger.warn(`Moving job ${jobId} to DLQ after ${job.attemptsMade} attempts`);

    const dlqData: DlqJobData = {
      jobId,
      deal_id,
      file_id,
      file_name,
      originalJobId: jobId,
      failedAt: new Date().toISOString(),
      totalAttempts: job.attemptsMade,
      lastError,
      errorHistory,
    };

    await this.dlqQueue.add(`dlq:${jobId}`, dlqData, {
      jobId: `dlq_${jobId.replace(/:/g, '_')}`,
    });

    await this.redisService.updateJobStatus(jobId, JobStatus.DEAD, {
      error_code: lastError.code,
      error_message: `Moved to DLQ after ${job.attemptsMade} attempts: ${lastError.message}`,
    });

    this.logger.log(`Job ${jobId} moved to DLQ`);
  }

  async getDlqJobs(limit = 100): Promise<Job<DlqJobData>[]> {
    return this.dlqQueue.getJobs(['waiting', 'delayed', 'paused'], 0, limit);
  }

  async getDlqCount(): Promise<number> {
    const counts = await this.dlqQueue.getJobCounts();
    return counts.waiting + counts.delayed + counts.paused;
  }

  async retryFromDlq(dlqJobId: string): Promise<boolean> {
    const job = await this.dlqQueue.getJob(dlqJobId);

    if (!job) {
      this.logger.warn(`DLQ job ${dlqJobId} not found`);
      return false;
    }

    this.logger.log(`Retrying job ${job.data.originalJobId} from DLQ`);

    await this.redisService.updateJobStatus(job.data.originalJobId, JobStatus.PENDING, {
      error_code: undefined,
      error_message: undefined,
    });

    await job.remove();
    return true;
  }

  async removeDlqJob(dlqJobId: string): Promise<boolean> {
    const job = await this.dlqQueue.getJob(dlqJobId);

    if (!job) {
      return false;
    }

    await job.remove();
    this.logger.log(`DLQ job ${dlqJobId} removed`);
    return true;
  }

  async clearDlq(): Promise<number> {
    const jobs = await this.getDlqJobs(1000);
    let count = 0;

    for (const job of jobs) {
      await job.remove();
      count++;
    }

    this.logger.log(`Cleared ${count} jobs from DLQ`);
    return count;
  }

  async onModuleDestroy(): Promise<void> {
    await this.dlqQueue.close();
  }
}

