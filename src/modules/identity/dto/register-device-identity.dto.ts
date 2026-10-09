import { IsString, Matches } from 'class-validator';

export class RegisterDeviceIdentityDto {
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/, {
    message: 'publicKey должен быть base64 от 32 байт Ed25519',
  })
  publicKey!: string;
}
