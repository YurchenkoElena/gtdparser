import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall service status',
    example: 'ok',
  })
  status: 'ok' | 'error';

  @ApiProperty({
    description: 'Redis connection status',
    example: 'ok',
  })
  redis: 'ok' | 'error';

  @ApiProperty({
    description: 'Filesystem (temp directory) status',
    example: 'ok',
  })
  fs: 'ok' | 'error';
}

