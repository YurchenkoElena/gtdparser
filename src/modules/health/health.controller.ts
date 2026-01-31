import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { HealthResponseDto } from './dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Checks Redis connection and filesystem availability',
  })
  @ApiResponse({
    status: 200,
    description: 'All systems operational',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'One or more systems unavailable',
    type: HealthResponseDto,
  })
  async checkHealth(@Res() res: Response): Promise<void> {
    const health = await this.healthService.checkHealth();
    const statusCode =
      health.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(health);
  }
}

