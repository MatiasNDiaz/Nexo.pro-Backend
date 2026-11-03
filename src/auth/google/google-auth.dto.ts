import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsString, Length, MaxLength } from 'class-validator';
import { RegisterDto } from '../dto/register.dto';
import { PASSWORD_MAX_LENGTH } from '../services/password.service';
import { OAuthRequestKind } from '../entities/auth-identity.entity';

/** Registro con Google: los mismos datos obligatorios del registro, sin email ni contraseña. */
export class GoogleRegisterDto extends OmitType(RegisterDto, ['email', 'password'] as const) {}

export class GoogleLinkPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class GoogleLinkConfirmDto {
  @ApiProperty({ description: 'Token del enlace enviado por email' })
  @IsString()
  @Length(20, 100)
  token: string;
}

export class SetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(8, PASSWORD_MAX_LENGTH)
  newPassword: string;
}

/** Lo que el frontend necesita para mostrar la pantalla de vincular o completar el registro. */
export class GooglePendingDto {
  @ApiProperty({ enum: OAuthRequestKind }) kind: OAuthRequestKind;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) firstName: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName: string | null;
}
