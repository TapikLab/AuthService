import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IdentityService } from './identity.service';
import { RegisterDeviceIdentityDto } from './dto/register-device-identity.dto';
import { JwtAuthGuard } from '@modules/auth/jwt/jwt-auth.guard';
import { AuthenticatedRequest } from '@modules/auth/jwt/authenticated-request.interface';

@UseGuards(JwtAuthGuard)
@Controller('auth/devices')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterDeviceIdentityDto,
  ) {
    return this.identityService.registerDevice(req.user.userId, dto.publicKey);
  }

  @Delete(':deviceId')
  revokeDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.identityService.revokeDevice(req.user.userId, deviceId);
  }
}
