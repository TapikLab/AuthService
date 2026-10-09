import { Module } from '@nestjs/common';
import { PrismaModule } from '@common/prisma/prisma.module';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { IdentityGrpcController } from './grpc-internal/identity-grpc.controller';

@Module({
  imports: [PrismaModule],
  controllers: [IdentityController, IdentityGrpcController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
