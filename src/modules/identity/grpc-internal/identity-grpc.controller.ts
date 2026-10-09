import { Controller, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { InternalGrpcAuthGuard } from './internal-grpc-auth.guard';
import { DeviceKeyLookup, IdentityService } from '../identity.service';

@SkipThrottle()
@UseGuards(InternalGrpcAuthGuard)
@Controller()
export class IdentityGrpcController {
  constructor(private readonly identityService: IdentityService) {}

  @GrpcMethod('IdentityInternal', 'GetDeviceKey')
  getDeviceKey(data: {
    userId: string;
    deviceId: string;
  }): Promise<DeviceKeyLookup> {
    return this.identityService.getDeviceKey(data.userId, data.deviceId);
  }
}
