import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../services/password.service';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Sin mínimo: un largo inválido es simplemente una credencial incorrecta.
  @ApiProperty()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

/** Segundo factor del admin: un código TOTP o, si perdió el dispositivo, un código de recuperación. */
export class MfaVerifyDto {
  @ApiPropertyOptional({ example: '123456' })
  @ValidateIf((dto: MfaVerifyDto) => dto.recoveryCode === undefined)
  @Matches(/^\d{6}$/)
  code?: string;

  @ApiPropertyOptional({ example: 'ABCDE-FGHJK' })
  @IsOptional()
  @IsString()
  @Length(10, 11)
  recoveryCode?: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @Length(20, 100)
  token: string;
}

export class EmailDto {
  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @Length(20, 100)
  token: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH.user, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH.user)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH.user, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH.user)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

/** Acción sensible del admin: el motivo es obligatorio y queda en la auditoría (ADR 0002). */
export class AdminReasonDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 500)
  reason: string;
}
