import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JobStatusResponseDto, DlqListResponseDto, DlqRetryResponseDto } from './dto';
import { JobTokenGuard } from './guards';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':jobId')
  @UseGuards(JobTokenGuard)
  @ApiOperation({
    summary: 'Get job status',
    description: 'Returns the current status and details of a processing job',
  })
  @ApiParam({
    name: 'jobId',
    description: 'The job ID returned from webhook',
    example: 'gtd:01HX...',
  })
  @ApiQuery({
    name: 'token',
    description: 'Job status access token (JOB_STATUS_TOKEN)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Job status retrieved successfully',
    type: JobStatusResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid token',
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
  })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @Query('token') _token: string,
  ): Promise<JobStatusResponseDto> {
    return this.jobsService.getJobStatus(jobId);
  }

  @Get('dlq/list')
  @UseGuards(JobTokenGuard)
  @ApiOperation({
    summary: 'Get Dead Letter Queue jobs',
    description: 'Returns list of jobs that failed after all retry attempts',
  })
  @ApiQuery({
    name: 'token',
    description: 'Job status access token (JOB_STATUS_TOKEN)',
    required: true,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of jobs to return',
    required: false,
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'DLQ jobs retrieved successfully',
    type: DlqListResponseDto,
  })
  async getDlqJobs(
    @Query('token') _token: string,
    @Query('limit') limit?: number,
  ): Promise<DlqListResponseDto> {
    return this.jobsService.getDlqJobs(limit);
  }

  @Post('dlq/:dlqJobId/retry')
  @UseGuards(JobTokenGuard)
  @ApiOperation({
    summary: 'Retry a job from DLQ',
    description: 'Moves a job from DLQ back to the main queue for retry',
  })
  @ApiParam({
    name: 'dlqJobId',
    description: 'The DLQ job ID',
  })
  @ApiQuery({
    name: 'token',
    description: 'Job status access token (JOB_STATUS_TOKEN)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Job queued for retry',
    type: DlqRetryResponseDto,
  })
  async retryDlqJob(
    @Param('dlqJobId') dlqJobId: string,
    @Query('token') _token: string,
  ): Promise<DlqRetryResponseDto> {
    return this.jobsService.retryFromDlq(dlqJobId);
  }

  @Delete('dlq/:dlqJobId')
  @UseGuards(JobTokenGuard)
  @ApiOperation({
    summary: 'Remove a job from DLQ',
    description: 'Permanently removes a job from the Dead Letter Queue',
  })
  @ApiParam({
    name: 'dlqJobId',
    description: 'The DLQ job ID',
  })
  @ApiQuery({
    name: 'token',
    description: 'Job status access token (JOB_STATUS_TOKEN)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Job removed from DLQ',
    type: DlqRetryResponseDto,
  })
  async removeDlqJob(
    @Param('dlqJobId') dlqJobId: string,
    @Query('token') _token: string,
  ): Promise<DlqRetryResponseDto> {
    return this.jobsService.removeFromDlq(dlqJobId);
  }
}

