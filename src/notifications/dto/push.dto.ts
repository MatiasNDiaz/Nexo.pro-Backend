import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NotificationCategory } from '../entities/push.entities';

/** Lo que devuelve `PushSubscription.toJSON()` en el navegador (claves en base64url). */
export class PushKeysDto {
  @ApiProperty({ description: 'Clave pública P-256 del navegador (65 bytes, base64url)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{87}$/)
  p256dh: string;

  @ApiProperty({ description: 'Secreto de autenticación (16 bytes, base64url)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  auth: string;
}

export class PushSubscribeDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/…' })
  @IsString()
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushUnsubscribeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  endpoint: string;
}

export class PushKeyDto {
  @ApiProperty({ description: 'false: el push no está configurado (no ofrecerlo)' })
  enabled: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'applicationServerKey (base64url)' })
  publicKey: string | null;
}

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @ApiProperty({ description: 'Avisos por push de esta categoría' })
  @IsBoolean()
  push: boolean;
}

export class UpdatePreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(NotificationCategory).length)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  preferences: NotificationPreferenceDto[];
}
