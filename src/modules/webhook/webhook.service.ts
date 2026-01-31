import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from '../queue';
import { GtdWebhookDto, GtdWebhookResponseDto } from './dto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private queueService: QueueService) {}

  async createGtdJob(dto: GtdWebhookDto): Promise<GtdWebhookResponseDto> {
    this.logger.log(`Creating job for deal_id=${dto.deal_id}, file_id=${dto.file_id}`);

    const jobId = await this.queueService.addJob({
      deal_id: dto.deal_id,
      file_id: dto.file_id,
      file_name: dto.file_name,
    });

    this.logger.log(`Job ${jobId} created and added to queue`);

    return {
      ok: true,
      jobId,
    };
  }
}

