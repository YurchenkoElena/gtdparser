import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { QUEUE_NAME } from './queue.constants';
import { RedisService } from './redis.service';
import { GtdJobData, JobRecord } from './interfaces';
import { JobStatus } from '../../common';
import { RETRY_CONFIG } from './retry.config';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue<GtdJobData>;

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    const connection = this.redisService.getClient();

    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
        attempts: RETRY_CONFIG.maxAttempts,
        backoff: {
          type: 'custom',
        },
      },
    });

    this.logger.log(`Queue "${QUEUE_NAME}" initialized with ${RETRY_CONFIG.maxAttempts} max attempts`);
  }

  getQueue(): Queue<GtdJobData> {
    return this.queue;
  }

  async addJob(data: { deal_id: number; file_id: number; file_name: string }): Promise<string> {
    const uuid = randomUUID();
    const jobId = `gtd:${uuid}`;
    const bullJobId = `gtd_${uuid}`;
    const now = new Date().toISOString();

    const jobData: GtdJobData = {
      jobId,
      deal_id: data.deal_id,
      file_id: data.file_id,
      file_name: data.file_name,
    };

    const jobRecord: JobRecord = {
      jobId,
      status: JobStatus.PENDING,
      attempt: 0,
      deal_id: data.deal_id,
      file_id: data.file_id,
      file_name: data.file_name,
      created_at: now,
      updated_at: now,
    };

    await this.redisService.saveJobRecord(jobRecord);

    await this.queue.add(jobId, jobData, {
      jobId: bullJobId,
    });

    this.logger.log(`Job ${jobId} added to queue`);
    return jobId;
  }

  async getJobStatus(jobId: string): Promise<JobRecord | null> {
    return this.redisService.getJobRecord(jobId);
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates?: {
      attempt?: number;
      error_code?: string;
      error_message?: string;
      file_hash?: string;
    },
  ): Promise<void> {
    await this.redisService.updateJobStatus(jobId, status, updates);
  }

  async addErrorToHistory(
    jobId: string,
    attempt: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const historyKey = `job:${jobId}:errors`;
    const errorEntry = JSON.stringify({
      attempt,
      error_code: errorCode,
      error_message: errorMessage,
      timestamp: new Date().toISOString(),
    });

    await this.redisService.getClient().rpush(historyKey, errorEntry);
    await this.redisService.getClient().expire(historyKey, 60 * 60 * 24 * 30); // 30 days
  }

  async getErrorHistory(
    jobId: string,
  ): Promise<Array<{ attempt: number; error_code: string; error_message: string; timestamp: string }>> {
    const historyKey = `job:${jobId}:errors`;
    const entries = await this.redisService.getClient().lrange(historyKey, 0, -1);
    return entries.map((entry) => JSON.parse(entry));
  }

  getMaxAttempts(): number {
    return RETRY_CONFIG.maxAttempts;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

