import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authToken = request.body?.auth_token;
    const expectedToken = this.configService.get<string>('auth.inboundToken');

    if (!authToken || authToken !== expectedToken) {
      throw new UnauthorizedException('Invalid auth_token');
    }

    return true;
  }
}

