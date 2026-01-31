import { Global, Module } from '@nestjs/common';
import { AdobeService } from './adobe.service';

@Global()
@Module({
  providers: [AdobeService],
  exports: [AdobeService],
})
export class AdobeModule {}

