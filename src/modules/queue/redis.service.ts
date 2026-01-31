import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JobRecord } from './interfaces';
import { JobStatus } from '../../common';
import { JOB_PREFIX, IDEM_PREFIX } from './queue.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('redis.host') || 'localhost';
    const port = this.configService.get<number>('redis.port') || 6379;
    const password = this.configService.get<string>('redis.password');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async saveJobRecord(record: JobRecord): Promise<void> {
    const key = `${JOB_PREFIX}${record.jobId}`;
    await this.client.hset(key, {
      jobId: record.jobId,
      status: record.status,
      attempt: record.attempt.toString(),
      deal_id: record.deal_id.toString(),
      file_id: record.file_id.toString(),
      file_name: record.file_name,
      file_hash: record.file_hash || '',
      created_at: record.created_at,
      updated_at: record.updated_at,
      error_code: record.error_code || '',
      error_message: record.error_message || '',
    });
  }

  async getJobRecord(jobId: string): Promise<JobRecord | null> {
    const key = `${JOB_PREFIX}${jobId}`;
    const data = await this.client.hgetall(key);

    if (!data || !data.jobId) {
      return null;
    }

    return {
      jobId: data.jobId,
      status: data.status as JobStatus,
      attempt: parseInt(data.attempt, 10),
      deal_id: parseInt(data.deal_id, 10),
      file_id: parseInt(data.file_id, 10),
      file_name: data.file_name,
      file_hash: data.file_hash || undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
      error_code: data.error_code || undefined,
      error_message: data.error_message || undefined,
    };
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
    const key = `${JOB_PREFIX}${jobId}`;

    const fields: Record<string, string> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (updates?.attempt !== undefined) {
      fields.attempt = updates.attempt.toString();
    }
    if (updates?.error_code) {
      fields.error_code = updates.error_code;
    }
    if (updates?.error_message) {
      fields.error_message = updates.error_message;
    }
    if (updates?.file_hash) {
      fields.file_hash = updates.file_hash;
    }

    await this.client.hset(key, fields);
  }

  async checkIdempotency(hash: string): Promise<string | null> {
    const key = `${IDEM_PREFIX}${hash}`;
    return this.client.get(key);
  }

  async setIdempotency(hash: string, jobId: string, ttlSeconds: number): Promise<void> {
    const key = `${IDEM_PREFIX}${hash}`;
    await this.client.setex(key, ttlSeconds, jobId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

