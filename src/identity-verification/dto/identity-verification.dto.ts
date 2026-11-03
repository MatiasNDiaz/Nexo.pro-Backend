import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { UserRole, VerificationStatus } from '../../users/user.enums';
import { FileResponseDto } from '../../uploads/dto/uploads.dto';
import {
  type IdentityVerification,
  VerificationKind,
} from '../entities/identity-verification.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const ADMIN_DECISIONS = ['APPROVE', 'REJECT', 'REVOKE'] as const;
export type AdminDecision = (typeof ADMIN_DECISIONS)[number];

export class AdminDecisionDto {
  @ApiProperty({ enum: ADMIN_DECISIONS })
  @IsIn(ADMIN_DECISIONS)
  decision: AdminDecision;

  /** Motivo obligatorio para la auditoría (actor, fecha, objeto, motivo y resultado). */
  @ApiProperty({ minLength: 5, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @Length(5, 300)
  reason: string;

  @ApiPropertyOptional({
    description: 'Código corto visible para el usuario, p. ej. DOCUMENT_MISMATCH',
  })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{2,59}$/)
  reasonCode?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Cómo se verificó (videollamada, presencial…). Interno: el usuario no lo ve.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  adminNote?: string;
}

export class ListVerificationsQueryDto {
  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

/** Lo que ve el propio usuario. Sin nota interna, sin id del admin, sin referencia del proveedor. */
export class VerificationResponseDto {
  @ApiProperty({ nullable: true, type: String }) id: string | null;
  @ApiProperty({
    enum: VerificationKind,
    nullable: true,
    description: 'IDENTITY o PROFILE_CHANGE (revisión de foto o nombre nuevos, ADR 0019 y 0021)',
  })
  kind: VerificationKind | null;
  @ApiProperty({ enum: VerificationStatus }) status: VerificationStatus;
  @ApiProperty({ nullable: true, type: String }) provider: string | null;
  @ApiProperty() attemptNumber: number;
  @ApiProperty({ nullable: true, type: String }) submittedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) decidedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) reasonCode: string | null;

  static from(v: IdentityVerification | null): VerificationResponseDto {
    return {
      id: v?.id ?? null,
      kind: v?.kind ?? null,
      status: v?.status ?? VerificationStatus.NOT_STARTED,
      provider: v?.provider ?? null,
      attemptNumber: v?.attemptNumber ?? 0,
      submittedAt: v?.submittedAt.toISOString() ?? null,
      decidedAt: v?.decidedAt?.toISOString() ?? null,
      reasonCode: v?.reasonCode ?? null,
    };
  }
}

/** Respuesta al iniciar: incluye cómo continuar con el proveedor (solo en ese momento). */
export class StartVerificationResponseDto extends VerificationResponseDto {
  @ApiProperty({ description: 'true si ya había un intento abierto y se devolvió ese' })
  alreadyInProgress: boolean;
  @ApiProperty({ nullable: true, type: String }) redirectUrl: string | null;
  @ApiProperty({ nullable: true, type: String }) clientToken: string | null;
  @ApiProperty({ description: 'true en modo manual: el admin se va a contactar con el usuario' })
  manualReview: boolean;
}

/** Datos mínimos de la persona para que el admin la reconozca al verificarla. */
export class VerificationSubjectDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() email: string;
  @ApiProperty() phone: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Nombre nuevo en revisión (ADR 0021)' })
  pendingFirstName: string | null;
  @ApiProperty({ nullable: true, type: String }) pendingLastName: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Foto nueva en revisión (ADR 0019)' })
  pendingAvatarUrl: string | null;
}

/** Vista del admin. */
export class AdminVerificationResponseDto extends VerificationResponseDto {
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true, type: String }) decisionSource: string | null;
  @ApiProperty({ nullable: true, type: String }) decidedBy: string | null;
  @ApiProperty({ nullable: true, type: String }) adminNote: string | null;
  @ApiPropertyOptional({ type: VerificationSubjectDto }) subject?: VerificationSubjectDto;

  static fromAdmin(
    v: IdentityVerification,
    subject?: VerificationSubjectDto,
  ): AdminVerificationResponseDto {
    return {
      ...VerificationResponseDto.from(v),
      userId: v.userId,
      decisionSource: v.decisionSource,
      decidedBy: v.decidedBy,
      adminNote: v.adminNote,
      ...(subject ? { subject } : {}),
    };
  }
}

export class PaginationMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}

export class AdminVerificationListDto {
  @ApiProperty({ type: [AdminVerificationResponseDto] }) data: AdminVerificationResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}

/** Respuesta al cambiar la foto: `underReview` si quedó pendiente de revisión (ADR 0019). */
export class AvatarResponseDto extends FileResponseDto {
  @ApiProperty() underReview: boolean;
}
