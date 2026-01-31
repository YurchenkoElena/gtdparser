import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JobTokenGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.query?.token;
    const expectedToken = this.configService.get<string>('auth.jobStatusToken');

    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Invalid token');
    }

    return true;
  }
}

