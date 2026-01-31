import { Global, Module } from '@nestjs/common';
import { DataValidatorService } from './data-validator.service';

@Global()
@Module({
  providers: [DataValidatorService],
  exports: [DataValidatorService],
})
export class DataValidatorModule {}

