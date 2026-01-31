import { Global, Module } from '@nestjs/common';
import { XlsxParserService } from './xlsx-parser.service';

@Global()
@Module({
  providers: [XlsxParserService],
  exports: [XlsxParserService],
})
export class XlsxParserModule {}

