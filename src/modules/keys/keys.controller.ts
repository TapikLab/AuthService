import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@modules/auth/jwt/jwt-auth.guard';
import type { AuthenticatedRequest } from '@modules/auth/jwt/authenticated-request.interface';
import { KeysService } from './keys.service';

@UseGuards(JwtAuthGuard)
@Controller('auth/keys')
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  @Put('devices/:deviceId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  publish(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() body: unknown,
  ): Promise<{ version: number }> {
    return this.keysService.publish(
      req.user.userId,
      deviceId.toLowerCase(),
      body,
    );
  }

  @Post('users/:userId/devices/:deviceId/claims')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  claim(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() body: unknown,
  ) {
    return this.keysService.claim(
      req.user.userId,
      userId.toLowerCase(),
      deviceId.toLowerCase(),
      body,
    );
  }
}
