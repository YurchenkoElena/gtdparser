import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo(): { name: string; version: string } {
    return {
      name: 'GTD Parser',
      version: '1.0.0',
    };
  }
}
