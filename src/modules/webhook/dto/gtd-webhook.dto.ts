import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsNotEmpty, Min } from 'class-validator';

export class GtdWebhookDto {
  @ApiProperty({
    description: 'Bitrix24 Deal ID',
    example: 123,
  })
  @IsInt()
  @Min(1)
  deal_id: number;

  @ApiProperty({
    description: 'Bitrix24 File ID of the PDF document',
    example: 456,
  })
  @IsInt()
  @Min(1)
  file_id: number;

  @ApiProperty({
    description: 'Original filename of the PDF',
    example: 'GTD_001.pdf',
  })
  @IsString()
  @IsNotEmpty()
  file_name: string;

  @ApiProperty({
    description: 'Authentication token',
    example: 'SECRET',
  })
  @IsString()
  @IsNotEmpty()
  auth_token: string;
}

export class GtdWebhookResponseDto {
  @ApiProperty({
    description: 'Operation success flag',
    example: true,
  })
  ok: boolean;

  @ApiProperty({
    description: 'Created job ID',
    example: 'gtd:01HX...',
  })
  jobId: string;
}

