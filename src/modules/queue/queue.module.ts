import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { QueueService } from './queue.service';
import { DlqService } from './dlq.service';

@Global()
@Module({
  providers: [RedisService, QueueService, DlqService],
  exports: [RedisService, QueueService, DlqService],
})
export class QueueModule {}

