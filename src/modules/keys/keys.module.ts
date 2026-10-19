import { Module } from '@nestjs/common';

import { PrismaModule } from '@common/prisma/prisma.module';
import { KeysController } from './keys.controller';
import { KeysService } from './keys.service';

@Module({
  imports: [PrismaModule],
  controllers: [KeysController],
  providers: [KeysService],
})
export class KeysModule {}
