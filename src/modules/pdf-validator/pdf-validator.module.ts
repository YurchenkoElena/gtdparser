import { Global, Module } from '@nestjs/common';
import { PdfValidatorService } from './pdf-validator.service';

@Global()
@Module({
  providers: [PdfValidatorService],
  exports: [PdfValidatorService],
})
export class PdfValidatorModule {}

