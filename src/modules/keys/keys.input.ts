import { BadRequestException, GoneException } from '@nestjs/common';

export interface PublicPrekey {
  keyId: number;
  publicKey: string;
}

export interface PublicKeysInput {
  version: number;
  registrationId: number;
  identityKey: string;
  signedPrekey: PublicPrekey & {
    signature: string;
  };
  oneTimePrekeys: PublicPrekey[];
}

export interface ClaimKeysInput {
  requestId: string;
}

const MAX_INT = 2_147_483_647;
const MAX_BATCH = 100;
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 60_000;

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function invalid(): never {
  throw new BadRequestException('INVALID_KEY_REQUEST');
}

function object(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid();

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if (
    keys.length !== fields.length ||
    keys.some((key) => !fields.includes(key))
  )
    return invalid();

  return record;
}

function integer(value: unknown, min: number, max: number = MAX_INT): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    return invalid();
  }

  return value;
}

function base64(value: unknown, bytes: number): string {
  if (typeof value !== 'string' || value.length !== 4 * Math.ceil(bytes / 3))
    return invalid();

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== bytes || decoded.toString('base64') !== value)
    return invalid();

  return value;
}

function publicKey(value: unknown): string {
  const encoded = base64(value, 33);
  if (Buffer.from(encoded, 'base64')[0] !== 0x05) return invalid();

  return encoded;
}

export function parsePublishKeys(value: unknown): PublicKeysInput {
  const input = object(value, [
    'version',
    'registrationId',
    'identityKey',
    'signedPrekey',
    'oneTimePrekeys',
  ]);

  const signed = object(input.signedPrekey, [
    'keyId',
    'publicKey',
    'signature',
  ]);

  if (
    !Array.isArray(input.oneTimePrekeys) ||
    input.oneTimePrekeys.length > MAX_BATCH
  )
    return invalid();

  const oneTimePrekeys: PublicPrekey[] = [];
  let previousId = -1;

  for (const value of input.oneTimePrekeys) {
    const item = object(value, ['keyId', 'publicKey']);
    const keyId = integer(item.keyId, 0);
    if (keyId <= previousId) return invalid();

    oneTimePrekeys.push({
      keyId,
      publicKey: publicKey(item.publicKey),
    });

    previousId = keyId;
  }

  return {
    version: integer(input.version, 1),
    registrationId: integer(input.registrationId, 1, 16_383),
    identityKey: publicKey(input.identityKey),
    signedPrekey: {
      keyId: integer(signed.keyId, 0),
      publicKey: publicKey(signed.publicKey),
      signature: base64(signed.signature, 64),
    },
    oneTimePrekeys,
  };
}

export function parseClaimKeys(value: unknown): ClaimKeysInput {
  const input = object(value, ['requestId']);
  if (typeof input.requestId !== 'string' || !UUID_V7.test(input.requestId))
    return invalid();

  return { requestId: input.requestId };
}

export function claimExpiresAt(requestId: string): Date {
  const timestamp = Number.parseInt(
    requestId.slice(0, 8) + requestId.slice(9, 13),
    16,
  );

  const now = Date.now();
  if (timestamp > now + CLOCK_TOLERANCE_MS) {
    throw new BadRequestException('REQUEST_ID_FROM_FUTURE');
  }

  const expiresAt = timestamp + CLAIM_TTL_MS;
  if (expiresAt <= now) {
    throw new GoneException('KEY_REQUEST_EXPIRED');
  }

  return new Date(expiresAt);
}
