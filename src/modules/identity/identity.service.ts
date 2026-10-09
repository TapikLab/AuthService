import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';

const ED25519_PUBLIC_KEY_BYTES = 32;
const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002';

export interface DeviceKeyLookup {
  found: boolean;
  publicKey: string;
  revoked: boolean;
}

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(userId: string, publicKey: string) {
    const raw = Buffer.from(publicKey, 'base64');

    if (
      raw.length !== ED25519_PUBLIC_KEY_BYTES ||
      raw.toString('base64') !== publicKey
    ) {
      throw new BadRequestException('Некорректный публичный ключ Ed25519');
    }

    try {
      const created = await this.prisma.deviceIdentity.create({
        data: { userId, publicKey },
      });
      return this.toView(created);
    } catch (error) {
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR;
      if (!isDuplicate) {
        throw error;
      }
    }

    const existing = await this.prisma.deviceIdentity.findUnique({
      where: { userId_publicKey: { userId, publicKey } },
    });
    if (!existing) {
      throw new ConflictException('Не удалось зарегистрировать устройство');
    }
    if (existing.revokedAt) {
      throw new ConflictException(
        'Ключ устройства отозван и не может быть зарегистрирован повторно',
      );
    }
    return this.toView(existing);
  }

  async revokeDevice(userId: string, deviceId: string) {
    const { count } = await this.prisma.deviceIdentity.updateMany({
      where: { id: deviceId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      const exists = await this.prisma.deviceIdentity.findFirst({
        where: { id: deviceId, userId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException('Устройство не найдено');
      }
    }
    return { success: true };
  }

  async getDeviceKey(
    userId: string,
    deviceId: string,
  ): Promise<DeviceKeyLookup> {
    const device = await this.prisma.deviceIdentity.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) {
      return { found: false, publicKey: '', revoked: false };
    }
    return {
      found: true,
      publicKey: device.publicKey,
      revoked: device.revokedAt !== null,
    };
  }

  private toView(device: { id: string; publicKey: string; createdAt: Date }) {
    return {
      deviceId: device.id,
      publicKey: device.publicKey,
      createdAt: device.createdAt,
    };
  }
}
