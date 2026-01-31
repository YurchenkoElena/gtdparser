import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as fs from 'fs';
import { RedisService } from '../queue';

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  fileHash: string;
  existingJobId?: string;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ttlSeconds: number;

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.ttlSeconds = this.configService.get<number>('idempotencyTtl') || 15552000; // 180 days
  }

  calculateFileHash(filePath: string): string {
    this.logger.debug(`Calculating hash for file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');
    this.logger.debug(`File hash: ${hash}`);
    return hash;
  }

  async checkDuplicate(fileHash: string): Promise<IdempotencyCheckResult> {
    this.logger.debug(`Checking idempotency for hash: ${fileHash}`);

    const existingJobId = await this.redisService.checkIdempotency(fileHash);

    if (existingJobId) {
      this.logger.log(`Duplicate found! Hash ${fileHash} already processed by job ${existingJobId}`);
      return {
        isDuplicate: true,
        fileHash,
        existingJobId,
      };
    }

    this.logger.debug(`No duplicate found for hash: ${fileHash}`);
    return {
      isDuplicate: false,
      fileHash,
    };
  }

  async markAsProcessed(fileHash: string, jobId: string): Promise<void> {
    this.logger.debug(`Marking hash ${fileHash} as processed by job ${jobId}`);
    await this.redisService.setIdempotency(fileHash, jobId, this.ttlSeconds);
    this.logger.log(`Hash ${fileHash} marked as processed (TTL: ${this.ttlSeconds}s)`);
  }

  async checkAndMark(filePath: string, jobId: string): Promise<IdempotencyCheckResult> {
    const fileHash = this.calculateFileHash(filePath);
    const result = await this.checkDuplicate(fileHash);

    if (!result.isDuplicate) {
      await this.markAsProcessed(fileHash, jobId);
    }

    return {
      ...result,
      fileHash,
    };
  }
}

