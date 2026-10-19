import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '@common/prisma/prisma.module';
import { RedisModule } from '@common/redis/redis.module';
import { EmailModule } from '@modules/email/email.module';
import { AuthModule } from '@modules/auth/auth.module';
import { TokenCleanupModule } from '@modules/token-cleanup/token-cleanup.module';
import { IdentityModule } from '@modules/identity/identity.module';
import { KeysModule } from '@modules/keys/keys.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 20,
        blockDuration: 30 * 60_000,
      },
    ]),
    PrismaModule,
    AuthModule,
    EmailModule,
    RedisModule,
    TokenCleanupModule,
    IdentityModule,
    KeysModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
