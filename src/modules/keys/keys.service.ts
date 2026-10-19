import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '@common/prisma/prisma.service';
import { claimExpiresAt, parseClaimKeys, parsePublishKeys } from './keys.input';

interface LockedDevice {
  id: string;
}

interface ClaimedPrekey {
  keyId: number;
  publicKey: string;
}

const MAX_AVAILABLE_PREKEYS = 1_000;

@Injectable()
export class KeysService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    userId: string,
    deviceId: string,
    body: unknown,
  ): Promise<{ version: number }> {
    const input = parsePublishKeys(body);

    // parsePublishKeys constructs fields in a fixed order.
    const publicationHash = createHash('sha256')
      .update(JSON.stringify(input), 'utf8')
      .digest('hex');

    return this.transaction(async (tx) => {
      await this.lockDevice(tx, userId, deviceId);

      const current = await tx.e2eBundle.findUnique({
        where: { deviceId },
      });

      if (current?.version === input.version) {
        if (current.publicationHash !== publicationHash) {
          throw new ConflictException('KEY_VERSION_CONFLICT');
        }

        return { version: current.version };
      }

      if (input.version !== (current?.version ?? 0) + 1) {
        throw new ConflictException('KEY_VERSION_OUT_OF_ORDER');
      }

      if (
        current &&
        (current.identityKey !== input.identityKey ||
          current.registrationId !== input.registrationId)
      ) {
        throw new ConflictException('DEVICE_IDENTITY_IMMUTABLE');
      }

      if (current) {
        const sameSignedPrekey =
          current.signedPrekeyId === input.signedPrekey.keyId &&
          current.signedPrekeyPublicKey === input.signedPrekey.publicKey &&
          current.signedPrekeySignature === input.signedPrekey.signature;

        if (
          !sameSignedPrekey &&
          input.signedPrekey.keyId <= current.signedPrekeyId
        ) {
          throw new ConflictException('SIGNED_PREKEY_ID_REUSED');
        }
      }

      const previousLastId = current?.lastPrekeyId ?? -1;
      const firstNewKey = input.oneTimePrekeys[0];

      if (firstNewKey && firstNewKey.keyId <= previousLastId) {
        throw new ConflictException('ONE_TIME_PREKEY_ID_REUSED');
      }

      const available = await tx.e2eOneTimePrekey.count({
        where: { deviceId },
      });

      if (available + input.oneTimePrekeys.length > MAX_AVAILABLE_PREKEYS) {
        throw new ConflictException('PREKEY_POOL_FULL');
      }

      const lastNewKey = input.oneTimePrekeys.at(-1);

      const data = {
        registrationId: input.registrationId,
        identityKey: input.identityKey,
        signedPrekeyId: input.signedPrekey.keyId,
        signedPrekeyPublicKey: input.signedPrekey.publicKey,
        signedPrekeySignature: input.signedPrekey.signature,
        version: input.version,
        publicationHash,
        lastPrekeyId: lastNewKey?.keyId ?? previousLastId,
      };

      await tx.e2eBundle.upsert({
        where: { deviceId },
        create: { deviceId, ...data },
        update: data,
      });

      if (input.oneTimePrekeys.length > 0) {
        await tx.e2eOneTimePrekey.createMany({
          data: input.oneTimePrekeys.map((key) => ({
            deviceId,
            keyId: key.keyId,
            publicKey: key.publicKey,
          })),
        });
      }

      return { version: input.version };
    });
  }

  async claim(
    requesterUserId: string,
    targetUserId: string,
    targetDeviceId: string,
    body: unknown,
  ): Promise<Prisma.JsonValue> {
    const input = parseClaimKeys(body);

    // Reject expired requests before acquiring a database connection.
    claimExpiresAt(input.requestId);

    return this.transaction(async (tx) => {
      await this.lockDevice(tx, targetUserId, targetDeviceId);

      // Recheck after waiting for the device lock.
      const expiresAt = claimExpiresAt(input.requestId);

      const claimKey = {
        requesterUserId_requestId: {
          requesterUserId,
          requestId: input.requestId,
        },
      };

      const previous = await tx.e2eKeyClaim.findUnique({
        where: claimKey,
      });

      if (previous) {
        if (previous.targetDeviceId !== targetDeviceId) {
          throw new ConflictException('KEY_REQUEST_TARGET_CONFLICT');
        }

        return previous.response;
      }

      const bundle = await tx.e2eBundle.findUnique({
        where: { deviceId: targetDeviceId },
      });

      if (!bundle) {
        throw new NotFoundException('KEY_BUNDLE_NOT_FOUND');
      }

      const keys = await tx.$queryRaw<ClaimedPrekey[]>(
        Prisma.sql`
          DELETE FROM "E2eOneTimePrekey"
          WHERE "deviceId" = ${targetDeviceId}
            AND "keyId" = (
              SELECT "keyId"
              FROM "E2eOneTimePrekey"
              WHERE "deviceId" = ${targetDeviceId}
              ORDER BY "keyId"
              LIMIT 1
            )
          RETURNING "keyId", "publicKey"
        `,
      );

      const oneTimePrekey = keys[0];

      const response = {
        userId: targetUserId,
        deviceId: targetDeviceId,
        registrationId: bundle.registrationId,
        identityKey: bundle.identityKey,
        bundleVersion: bundle.version,
        signedPrekey: {
          keyId: bundle.signedPrekeyId,
          publicKey: bundle.signedPrekeyPublicKey,
          signature: bundle.signedPrekeySignature,
        },
        oneTimePrekey: oneTimePrekey
          ? {
              keyId: oneTimePrekey.keyId,
              publicKey: oneTimePrekey.publicKey,
            }
          : null,
      };

      await tx.e2eKeyClaim.create({
        data: {
          requesterUserId,
          requestId: input.requestId,
          targetDeviceId,
          response,
          expiresAt,
        },
      });

      return response;
    });
  }

  @Cron('*/10 * * * * *', { waitForCompletion: true })
  async cleanupExpiredClaims(): Promise<void> {
    // A grace period tolerates small clock differences between instances.
    // Bounded batches avoid one large deletion transaction.
    await this.prisma.$executeRaw`
      WITH expired AS (
        SELECT "requesterUserId", "requestId"
        FROM "E2eKeyClaim"
        WHERE "expiresAt" < NOW() - INTERVAL '1 hour'
        ORDER BY "expiresAt"
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "E2eKeyClaim" AS claim
      USING expired
      WHERE claim."requesterUserId" = expired."requesterUserId"
        AND claim."requestId" = expired."requestId"
    `;
  }

  private async lockDevice(
    tx: Prisma.TransactionClient,
    userId: string,
    deviceId: string,
  ): Promise<void> {
    const devices = await tx.$queryRaw<LockedDevice[]>(
      Prisma.sql`
        SELECT "id"
        FROM "DeviceIdentity"
        WHERE "id" = ${deviceId}
          AND "userId" = ${userId}
          AND "revokedAt" IS NULL
        FOR UPDATE
      `,
    );

    if (devices.length === 0) {
      throw new NotFoundException('ACTIVE_DEVICE_NOT_FOUND');
    }
  }

  private async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // The same request ID can race across different target devices.
        // The unique constraint rejects one transaction and rolls it back.
        if (error.code === 'P2002') {
          throw new ConflictException('KEY_REQUEST_CONFLICT');
        }

        if (
          error.code === 'P2024' ||
          error.code === 'P2028' ||
          error.code === 'P2034'
        ) {
          throw new ServiceUnavailableException('KEY_SERVICE_BUSY');
        }
      }

      throw error;
    }
  }
}
