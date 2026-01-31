import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from '../queue';
import { HealthResponseDto } from './dto';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async checkHealth(): Promise<HealthResponseDto> {
    const redisStatus = await this.checkRedis();
    const fsStatus = this.checkFileSystem();

    const overallStatus = redisStatus === 'ok' && fsStatus === 'ok' ? 'ok' : 'error';

    return {
      status: overallStatus,
      redis: redisStatus,
      fs: fsStatus,
    };
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const isHealthy = await this.redisService.ping();
      return isHealthy ? 'ok' : 'error';
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return 'error';
    }
  }

  private checkFileSystem(): 'ok' | 'error' {
    try {
      const tmpDir = this.configService.get<string>('tmpDir') || '/tmp/gtdparser';

      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const testFile = path.join(tmpDir, `.health-check-${Date.now()}`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      return 'ok';
    } catch (error) {
      this.logger.error('Filesystem health check failed', error);
      return 'error';
    }
  }
}

