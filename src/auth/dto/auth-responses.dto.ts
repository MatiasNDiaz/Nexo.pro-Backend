import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../users/entities/user.entity';
import { AccountStatus, UserRole, VerificationStatus } from '../../users/user.enums';

/** Lo que el frontend sabe del usuario actual. Nunca incluye hashes, tokens ni datos de sesión. */
export class CurrentUserDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus: VerificationStatus;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() createdAt: Date;

  static from(user: User): CurrentUserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      verificationStatus: user.verificationStatus,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt,
    };
  }
}

/**
 * Respuesta del login. El `csrfToken` NO es un secreto de autenticación: solo prueba que la
 * request viene de nuestro frontend (ver docs/auth.md). Los tokens de sesión van solo en cookies.
 */
export class SessionResponseDto {
  @ApiProperty({ type: CurrentUserDto }) user: CurrentUserDto;
  @ApiProperty() csrfToken: string;
}

export class MfaRequiredDto {
  @ApiProperty({ example: true }) mfaRequired: true;
}

export class CsrfTokenDto {
  @ApiProperty() csrfToken: string;
}

export class MessageDto {
  @ApiProperty() message: string;
}

export class SessionSummaryDto {
  @ApiProperty({ description: 'Id del dispositivo (familia de sesión)' }) id: string;
  @ApiProperty() current: boolean;
  @ApiProperty({ nullable: true, type: String }) userAgent: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true, type: Date }) lastUsedAt: Date | null;
}
