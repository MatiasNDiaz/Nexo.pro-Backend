import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaymentKind, PaymentStatus } from '../../../payments/entities/payment.entity';
import { UserRole } from '../../../users/user.enums';
import type { GroupBy } from '../../../common/calendar-periods';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const GROUP_BY: GroupBy[] = ['day', 'week', 'month', 'year'];
export const REVENUE_REPORTS = ['PAYMENTS', 'REGISTRATIONS', 'SUMMARY'] as const;
export type RevenueReport = (typeof REVENUE_REPORTS)[number];

/** En la query llega como texto; en el cuerpo de la exportación, como booleano. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Filtros comunes. Las fechas son días en hora de Córdoba, con ambos extremos incluidos. */
export class RevenueFiltersDto {
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Desde (incluido), hora de Córdoba' })
  @IsOptional()
  @Matches(DAY)
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Hasta (incluido), hora de Córdoba' })
  @IsOptional()
  @Matches(DAY)
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Profesionales que trabajan en esa localidad (pueden estar en varias) o clientes que viven ahí',
  })
  @IsOptional()
  @IsUUID()
  localityId?: string;
}

class PageDto extends RevenueFiltersDto {
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

export class RevenuePaymentsQueryDto extends PageDto {
  @ApiPropertyOptional({
    enum: PaymentStatus,
    description: 'Sin estado: aprobados, reembolsados y contracargos (los que movieron plata)',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentKind })
  @IsOptional()
  @IsEnum(PaymentKind)
  kind?: PaymentKind;
}

export class RevenueRegistrationsQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: [UserRole.CUSTOMER, UserRole.PROFESSIONAL] })
  @IsOptional()
  @IsIn([UserRole.CUSTOMER, UserRole.PROFESSIONAL])
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Tiene algún cobro que no se devolvió' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasPaid?: boolean;
}

export class RevenueSummaryQueryDto extends RevenueFiltersDto {
  @ApiPropertyOptional({ enum: GROUP_BY, default: 'month' })
  @IsOptional()
  @IsIn(GROUP_BY)
  groupBy: GroupBy = 'month';
}

/** Exportación a CSV: el reporte y sus filtros (los que no aplican al reporte se ignoran). */
export class RevenueExportDto extends RevenueFiltersDto {
  @ApiProperty({ enum: REVENUE_REPORTS })
  @IsIn(REVENUE_REPORTS)
  report: RevenueReport;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentKind })
  @IsOptional()
  @IsEnum(PaymentKind)
  kind?: PaymentKind;

  @ApiPropertyOptional({ enum: [UserRole.CUSTOMER, UserRole.PROFESSIONAL] })
  @IsOptional()
  @IsIn([UserRole.CUSTOMER, UserRole.PROFESSIONAL])
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasPaid?: boolean;

  @ApiPropertyOptional({ enum: GROUP_BY, default: 'month' })
  @IsOptional()
  @IsIn(GROUP_BY)
  groupBy: GroupBy = 'month';
}

// ---- Respuestas -------------------------------------------------------------------------------

export class RevenuePersonDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: '"Usuario eliminado" si la cuenta se anonimizó' }) name: string;
  @ApiProperty({ nullable: true, type: String }) email: string | null;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty() deleted: boolean;
  @ApiProperty({ type: [String], description: 'Donde trabaja (profesional) o vive (cliente), hoy' })
  localities: string[];
}

export class RevenuePaymentItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'Aprobación; si nunca se aprobó, creación' }) date: Date;
  @ApiProperty({ type: RevenuePersonDto }) user: RevenuePersonDto;
  @ApiProperty() planCode: string;
  @ApiProperty() planName: string;
  @ApiProperty({ nullable: true, type: String, description: 'Si el pago cambió el plan' })
  previousPlanCode: string | null;
  @ApiProperty({ enum: PaymentKind, nullable: true, description: 'Null: sin aplicar' })
  kind: PaymentKind | null;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiProperty({ example: '15000.00' }) amount: string;
  @ApiProperty({ example: 'ARS' }) currency: string;
  @ApiProperty({ nullable: true, type: Date }) moneyReturnedAt: Date | null;
}

export class RevenuePaymentListDto {
  @ApiProperty({ type: [RevenuePaymentItemDto] }) data: RevenuePaymentItemDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class RevenueRegistrationItemDto {
  @ApiProperty({ type: RevenuePersonDto }) user: RevenuePersonDto;
  @ApiProperty() registeredAt: Date;
  @ApiProperty({ nullable: true, type: String, description: 'Plan de la última suscripción' })
  currentPlanCode: string | null;
  @ApiProperty({
    nullable: true,
    type: Boolean,
    description: 'Tiene algún cobro que no se devolvió. Null: cliente que nunca pagó',
  })
  hasPaid: boolean | null;
}

export class RevenueRegistrationListDto {
  @ApiProperty({ type: [RevenueRegistrationItemDto] }) data: RevenueRegistrationItemDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class RevenueAmountsDto {
  @ApiProperty({ example: '45000.00', description: 'Cobrado (por fecha de aprobación)' })
  gross: string;
  @ApiProperty({ example: '0.00', description: 'Reembolsos (por fecha de devolución)' })
  refunds: string;
  @ApiProperty({ example: '0.00' }) chargebacks: string;
  @ApiProperty({ example: '45000.00' }) net: string;
  @ApiProperty({ description: 'Cantidad de cobros' }) payments: number;
  @ApiProperty({ description: 'Cantidad de reembolsos y contracargos' }) returns: number;
}

export class RevenuePlanAmountsDto extends RevenueAmountsDto {
  @ApiProperty() planCode: string;
}

export class RevenueTotalsDto extends RevenueAmountsDto {
  @ApiProperty({ type: [RevenuePlanAmountsDto] }) byPlan: RevenuePlanAmountsDto[];
}

export class RevenueBucketDto extends RevenueTotalsDto {
  @ApiProperty({ example: '2026-11-01', description: 'Comienzo del período' }) start: string;
}

export class RevenuePreviousDto extends RevenueTotalsDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
}

export class RevenueChangeDto {
  @ApiProperty({ example: '5000.00', description: 'Neto actual menos el anterior' }) net: string;
  @ApiProperty({ nullable: true, type: Number, description: 'Null si el anterior fue 0' })
  netPercent: number | null;
}

export class RevenueSummaryDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty({ enum: GROUP_BY }) groupBy: GroupBy;
  @ApiProperty({ example: 'ARS' }) currency: string;
  @ApiProperty({ type: [RevenueBucketDto] }) buckets: RevenueBucketDto[];
  @ApiProperty({ type: RevenueTotalsDto }) total: RevenueTotalsDto;
  @ApiProperty({ type: RevenuePreviousDto }) previous: RevenuePreviousDto;
  @ApiProperty({ type: RevenueChangeDto }) change: RevenueChangeDto;
  @ApiProperty({
    description: 'Con filtro de localidad, un profesional que trabaja en varias suma en cada una',
  })
  localityMayOverlap: boolean;
}
