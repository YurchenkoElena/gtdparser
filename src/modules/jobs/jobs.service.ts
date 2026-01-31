import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueueService, DlqService } from '../queue';
import { JobStatusResponseDto, DlqListResponseDto, DlqRetryResponseDto } from './dto';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private queueService: QueueService,
    private dlqService: DlqService,
  ) {}

  async getJobStatus(jobId: string): Promise<JobStatusResponseDto> {
    this.logger.log(`Getting status for job ${jobId}`);

    const record = await this.queueService.getJobStatus(jobId);

    if (!record) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const errorHistory = await this.queueService.getErrorHistory(jobId);

    return {
      jobId: record.jobId,
      status: record.status,
      attempt: record.attempt,
      deal_id: record.deal_id,
      file_id: record.file_id,
      updated_at: record.updated_at,
      error: record.error_message || null,
      validationErrors: record.validation_errors,
      validationWarnings: record.validation_warnings,
    };
  }

  async getDlqJobs(limit = 100): Promise<DlqListResponseDto> {
    this.logger.log('Getting DLQ jobs');

    const jobs = await this.dlqService.getDlqJobs(limit);
    const total = await this.dlqService.getDlqCount();

    return {
      total,
      jobs: jobs.map((job) => ({
        dlqJobId: job.id || '',
        originalJobId: job.data.originalJobId,
        deal_id: job.data.deal_id,
        file_id: job.data.file_id,
        file_name: job.data.file_name,
        failedAt: job.data.failedAt,
        totalAttempts: job.data.totalAttempts,
        lastError: job.data.lastError,
      })),
    };
  }

  async retryFromDlq(dlqJobId: string): Promise<DlqRetryResponseDto> {
    this.logger.log(`Retrying job ${dlqJobId} from DLQ`);

    const success = await this.dlqService.retryFromDlq(dlqJobId);

    if (!success) {
      return {
        ok: false,
        message: `DLQ job ${dlqJobId} not found`,
      };
    }

    return {
      ok: true,
      message: 'Job queued for retry',
    };
  }

  async removeFromDlq(dlqJobId: string): Promise<DlqRetryResponseDto> {
    this.logger.log(`Removing job ${dlqJobId} from DLQ`);

    const success = await this.dlqService.removeDlqJob(dlqJobId);

    if (!success) {
      return {
        ok: false,
        message: `DLQ job ${dlqJobId} not found`,
      };
    }

    return {
      ok: true,
      message: 'Job removed from DLQ',
    };
  }
}

