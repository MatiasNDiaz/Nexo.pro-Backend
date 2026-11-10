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
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Motivo, solo si la cuenta está suspendida o baneada (ADR 0007)',
  })
  statusReason: string | null;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus: VerificationStatus;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'Foto de perfil (null si no cargó)' })
  avatarUrl: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Foto nueva en revisión del admin (ADR 0019); en público se ve avatarUrl',
  })
  pendingAvatarUrl: string | null;
  @ApiProperty() createdAt: Date;

  static from(
    user: User,
    avatars: { avatarUrl: string | null; pendingAvatarUrl: string | null },
  ): CurrentUserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      statusReason:
        user.status === AccountStatus.SUSPENDED || user.status === AccountStatus.BANNED
          ? user.statusReason
          : null,
      verificationStatus: user.verificationStatus,
      emailVerified: user.emailVerifiedAt !== null,
      ...avatars,
      createdAt: user.createdAt,
    };
  }
}

/** `/auth/me`: el usuario y cómo puede entrar (ADR 0023). */
export class MeDto extends CurrentUserDto {
  @ApiProperty({ description: 'false en cuentas creadas con Google sin contraseña' })
  hasPassword: boolean;
  @ApiProperty() googleLinked: boolean;
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

/**
 * `GET /auth/csrf`: null = no hay sesión en este navegador. Es una respuesta normal (200), no un
 * error: es lo que pasa en cada visita sin sesión, y un 401 ensuciaba la consola del navegador.
 */
export class SessionCsrfDto {
  @ApiProperty({ type: String, nullable: true }) csrfToken: string | null;
}

export class MessageDto {
  @ApiProperty() message: string;
}

export class SessionClosedDto {
  @ApiProperty({ description: 'false si esa sesión ya estaba cerrada' }) closed: boolean;
}

export class SessionSummaryDto {
  @ApiProperty({ description: 'Id del dispositivo (familia de sesión)' }) id: string;
  @ApiProperty() current: boolean;
  @ApiProperty({ nullable: true, type: String }) userAgent: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true, type: Date }) lastUsedAt: Date | null;
}
