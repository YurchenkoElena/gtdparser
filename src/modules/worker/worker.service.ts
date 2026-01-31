import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { QUEUE_NAME, QueueService, RedisService, DlqService, GtdJobData, getBackoffDelay, formatDuration } from '../queue';
import { PipelineService, ProcessingError } from './pipeline.service';
import { ProcessingContext } from './interfaces';
import { JobStatus } from '../../common';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private worker: Worker<GtdJobData>;

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
    private queueService: QueueService,
    private dlqService: DlqService,
    private pipelineService: PipelineService,
  ) {}

  async onModuleInit(): Promise<void> {
    const concurrency = this.configService.get<number>('worker.concurrency') || 2;

    this.worker = new Worker<GtdJobData>(
      QUEUE_NAME,
      async (job) => {
        return this.processJob(job);
      },
      {
        connection: this.redisService.getClient(),
        concurrency,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            return getBackoffDelay(attemptsMade);
          },
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.data.jobId} completed successfully`);
    });

    this.worker.on('failed', async (job, error) => {
      if (!job) return;

      const { jobId } = job.data;
      const attemptsMade = job.attemptsMade;
      const maxAttempts = this.queueService.getMaxAttempts();

      this.logger.warn(`Job ${jobId} failed on attempt ${attemptsMade}/${maxAttempts}: ${error.message}`);

      const errorCode = error instanceof ProcessingError ? error.code : 'UNKNOWN_ERROR';
      await this.queueService.addErrorToHistory(jobId, attemptsMade, errorCode, error.message);

      if (attemptsMade >= maxAttempts) {
        this.logger.error(`Job ${jobId} exhausted all ${maxAttempts} attempts, moving to DLQ`);
        const errorHistory = await this.queueService.getErrorHistory(jobId);
        await this.dlqService.moveToDeadLetter(job, { code: errorCode, message: error.message }, errorHistory);
      } else {
        const nextDelay = getBackoffDelay(attemptsMade + 1);
        this.logger.log(
          `Job ${jobId} will retry in ${formatDuration(nextDelay)} (attempt ${attemptsMade + 1}/${maxAttempts})`,
        );
      }
    });

    this.worker.on('error', (error) => {
      this.logger.error('Worker error', error);
    });

    this.logger.log(
      `Worker started with concurrency: ${concurrency}, max attempts: ${this.queueService.getMaxAttempts()}`,
    );
  }

  private async processJob(job: Job<GtdJobData>): Promise<void> {
    const { jobId, deal_id, file_id, file_name } = job.data;

    this.logger.log(`Processing job ${jobId} (attempt ${job.attemptsMade + 1})`);

    await this.queueService.updateJobStatus(jobId, JobStatus.IN_PROGRESS, {
      attempt: job.attemptsMade + 1,
    });

    const context: ProcessingContext = {
      jobId,
      deal_id,
      file_id,
      file_name,
    };

    const result = await this.pipelineService.process(context);

    if (result.success) {
      await this.queueService.updateJobStatus(jobId, JobStatus.SUCCESS, {
        file_hash: context.fileHash,
      });
    } else {
      const error = result.error!;

      if (!error.retryable) {
        const status =
          error.code === 'NOT_GTD' || error.code === 'INVALID_FORMAT'
            ? JobStatus.REJECTED_NOT_GTD
            : JobStatus.FAILED;

        await this.queueService.updateJobStatus(jobId, status, {
          error_code: error.code,
          error_message: error.message,
        });

        return;
      }

      await this.queueService.updateJobStatus(jobId, JobStatus.FAILED, {
        error_code: error.code,
        error_message: error.message,
      });

      throw new ProcessingError(error.code, error.message, error.retryable);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Worker stopped');
    }
  }
}

