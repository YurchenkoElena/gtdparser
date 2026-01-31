import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DlqJobDto {
  @ApiProperty({ description: 'DLQ Job ID' })
  dlqJobId: string;

  @ApiProperty({ description: 'Original Job ID' })
  originalJobId: string;

  @ApiProperty({ description: 'Bitrix Deal ID' })
  deal_id: number;

  @ApiProperty({ description: 'File ID' })
  file_id: number;

  @ApiProperty({ description: 'File name' })
  file_name: string;

  @ApiProperty({ description: 'When job was moved to DLQ' })
  failedAt: string;

  @ApiProperty({ description: 'Total attempts made' })
  totalAttempts: number;

  @ApiProperty({ description: 'Last error' })
  lastError: {
    code: string;
    message: string;
  };
}

export class DlqListResponseDto {
  @ApiProperty({ description: 'Total jobs in DLQ' })
  total: number;

  @ApiProperty({ description: 'Jobs in DLQ', type: [DlqJobDto] })
  jobs: DlqJobDto[];
}

export class DlqRetryResponseDto {
  @ApiProperty({ description: 'Operation success' })
  ok: boolean;

  @ApiPropertyOptional({ description: 'Message' })
  message?: string;
}

