import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '../../../common';

export class JobStatusResponseDto {
  @ApiProperty({
    description: 'Job ID',
    example: 'gtd:01HX...',
  })
  jobId: string;

  @ApiProperty({
    description: 'Current job status',
    enum: JobStatus,
    example: JobStatus.PENDING,
  })
  status: JobStatus;

  @ApiProperty({
    description: 'Current attempt number',
    example: 1,
  })
  attempt: number;

  @ApiProperty({
    description: 'Bitrix24 Deal ID',
    example: 123,
  })
  deal_id: number;

  @ApiProperty({
    description: 'Bitrix24 File ID',
    example: 456,
  })
  file_id: number;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-21T10:15:00Z',
  })
  updated_at: string;

  @ApiPropertyOptional({
    description: 'Error message if failed',
    example: null,
  })
  error: string | null;

  @ApiPropertyOptional({
    description: 'Validation errors if any',
    example: [],
  })
  validationErrors?: string[];

  @ApiPropertyOptional({
    description: 'Validation warnings if any',
    example: [],
  })
  validationWarnings?: string[];
}

