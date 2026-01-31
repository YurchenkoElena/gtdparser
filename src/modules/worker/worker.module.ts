import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { PipelineService } from './pipeline.service';

@Module({
  providers: [WorkerService, PipelineService],
  exports: [WorkerService, PipelineService],
})
export class WorkerModule {}

