import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  AppealStatus,
  ReportReason,
  ReportStatus,
  ReportTarget,
  SanctionType,
} from '../entities/moderation.entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Hasta 3 fotos privadas por reporte (ADR 0029). */
export const MAX_REPORT_EVIDENCE = 3;

export class CreateReportDto {
  @ApiProperty({ enum: ReportTarget })
  @IsEnum(ReportTarget)
  targetType: ReportTarget;

  @ApiProperty({ format: 'uuid', description: 'En PROFILE, el id del usuario' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({ type: [String], description: 'Archivos EVIDENCE propios, confirmados' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REPORT_EVIDENCE)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  evidenceFileIds?: string[];
}

/** Lo que ve el denunciante de su reporte (sin la resolución interna). */
export class MyReportDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ReportTarget }) targetType: ReportTarget;
  @ApiProperty({ format: 'uuid' }) targetId: string;
  @ApiProperty({ enum: ReportReason }) reason: ReportReason;
  @ApiProperty({ enum: ReportStatus }) status: ReportStatus;
  @ApiProperty() createdAt: Date;
}

export class UserRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() email: string;
  @ApiProperty() role: string;
  @ApiProperty() status: string;
}

export class AdminReportDto extends MyReportDto {
  @ApiProperty() description: string;
  @ApiProperty({ type: UserRefDto }) reporter: UserRefDto;
  @ApiProperty({ type: UserRefDto }) reportedUser: UserRefDto;
  @ApiProperty({ type: [String], description: 'Ver con GET /evidence/:fileId' })
  evidenceFileIds: string[];
  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'El contenido reportado como estaba (texto, estado)',
  })
  target: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: Date }) resolvedAt: Date | null;
  @ApiProperty({ nullable: true, type: String }) resolutionNote: string | null;
}

export class AdminReportListDto {
  @ApiProperty({ type: [AdminReportDto] }) data: AdminReportDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminReportsQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportTarget })
  @IsOptional()
  @IsEnum(ReportTarget)
  targetType?: ReportTarget;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reportedUserId?: string;
}

export class ResolveReportDto {
  @ApiProperty({ description: 'true = válido; false = rechazado (sin consecuencias)' })
  @IsBoolean()
  valid: boolean;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  note: string;
}

export class ConversationMessageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() senderType: string;
  @ApiProperty({ nullable: true, type: String }) senderId: string | null;
  @ApiProperty() body: string;
  @ApiProperty({ nullable: true, type: String, description: 'Versión original (ADR 0024)' })
  originalBody: string | null;
  @ApiProperty() edited: boolean;
  @ApiProperty() deleted: boolean;
  @ApiProperty() reported: boolean;
  @ApiProperty() createdAt: Date;
}

export class ReportConversationDto {
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty({ type: [ConversationMessageDto] }) messages: ConversationMessageDto[];
}

// ---- Strikes, sanciones y apelaciones ----

export class AddStrikeDto {
  @ApiProperty({ minimum: 1, maximum: 3, description: 'Peso según la gravedad' })
  @IsInt()
  @Min(1)
  @Max(3)
  weight: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reportId?: string;
}

export class ApplySanctionDto {
  @ApiProperty({ enum: SanctionType })
  @IsEnum(SanctionType)
  type: SanctionType;

  @ApiProperty({ minLength: 10, maxLength: 500, description: 'El usuario lo ve' })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason: string;

  @ApiPropertyOptional({ description: 'Solo suspensión y perfil oculto: se levanta sola' })
  @IsOptional()
  @IsDateString({ strict: true })
  endsAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reportId?: string;
}

export class ModerationReasonDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  reason: string;
}

export class StrikeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() weight: number;
  @ApiProperty() reason: string;
  @ApiProperty() voided: boolean;
  @ApiProperty({ nullable: true, type: String }) voidReason: string | null;
  @ApiProperty() createdAt: Date;
}

export class SanctionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: SanctionType }) type: SanctionType;
  @ApiProperty() reason: string;
  @ApiProperty() startsAt: Date;
  @ApiProperty({ nullable: true, type: Date }) endsAt: Date | null;
  @ApiProperty() active: boolean;
  @ApiProperty({ nullable: true, type: Date }) liftedAt: Date | null;
}

export class CreateAppealDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Uno de los dos' })
  @IsOptional()
  @IsUUID()
  strikeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sanctionId?: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  body: string;
}

export class AppealDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) strikeId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) sanctionId: string | null;
  @ApiProperty() body: string;
  @ApiProperty({ enum: AppealStatus }) status: AppealStatus;
  @ApiProperty({ nullable: true, type: String }) decisionNote: string | null;
  @ApiProperty() createdAt: Date;
}

export class AdminAppealDto extends AppealDto {
  @ApiProperty({ type: UserRefDto }) user: UserRefDto;
}

export class MyModerationDto {
  @ApiProperty({ type: [SanctionDto] }) sanctions: SanctionDto[];
  @ApiProperty({ type: [StrikeDto] }) strikes: StrikeDto[];
  @ApiProperty({ type: [AppealDto] }) appeals: AppealDto[];
}

export class AdminAppealsQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: AppealStatus })
  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;
}

export class DecideAppealDto {
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'] })
  @IsIn([AppealStatus.ACCEPTED, AppealStatus.REJECTED])
  decision: AppealStatus.ACCEPTED | AppealStatus.REJECTED;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  note: string;
}
