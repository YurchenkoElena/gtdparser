import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { GtdWebhookDto, GtdWebhookResponseDto } from './dto';
import { WebhookAuthGuard } from './guards';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('bitrix/gtd')
  @HttpCode(200)
  @UseGuards(WebhookAuthGuard)
  @ApiOperation({
    summary: 'Receive GTD processing request from Bitrix24',
    description: 'Accepts a webhook from Bitrix24 with PDF file info and creates a processing job',
  })
  @ApiBody({ type: GtdWebhookDto })
  @ApiResponse({
    status: 200,
    description: 'Job created successfully',
    type: GtdWebhookResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing required fields or invalid types',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid auth_token',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async handleGtdWebhook(@Body() dto: GtdWebhookDto): Promise<GtdWebhookResponseDto> {
    return this.webhookService.createGtdJob(dto);
  }
}

