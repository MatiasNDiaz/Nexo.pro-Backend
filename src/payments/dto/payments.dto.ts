import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaymentPurpose, PaymentStatus } from '../entities/payment.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CheckoutDto {
  @ApiProperty({ example: 'MEDIUM' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z_]{2,20}$/)
  planCode: string;
}

export class CheckoutResponseDto {
  @ApiProperty({ format: 'uuid' }) paymentId: string;
  @ApiProperty({ enum: PaymentPurpose }) purpose: PaymentPurpose;
  @ApiProperty({ example: '15000.00' }) amount: string;
  @ApiProperty({ example: 'ARS' }) currency: string;
  @ApiProperty({ description: 'Enlace al checkout de Mercado Pago' }) checkoutUrl: string;
}

export class PlanOptionDto {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: '15000.00' }) price: string;
  @ApiProperty() currency: string;
  @ApiProperty() current: boolean;
  @ApiProperty({ description: 'Si hoy se puede pagar este plan' }) available: boolean;
  @ApiPropertyOptional({ enum: PaymentPurpose }) purpose?: PaymentPurpose;
  @ApiPropertyOptional({ description: 'Lo que se pagaría hoy (mes o diferencia)' })
  amount?: string;
  @ApiPropertyOptional({ enum: ['RENEWAL_NOT_YET', 'UPGRADE_WINDOW_CLOSED', 'FREE_PLAN'] })
  reason?: string;
}

export class PaymentItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() planCode: string;
  @ApiProperty({ enum: PaymentPurpose }) purpose: PaymentPurpose;
  @ApiProperty() amount: string;
  @ApiProperty() currency: string;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiProperty() applied: boolean;
  @ApiProperty() reverted: boolean;
  @ApiProperty({ nullable: true, type: Date }) grantedFrom: Date | null;
  @ApiProperty({ nullable: true, type: Date }) grantedUntil: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AdminPaymentItemDto extends PaymentItemDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ nullable: true, type: String }) providerPaymentId: string | null;
  @ApiProperty({ description: 'Aprobado sin aplicar: no coincidió, ver auditoría' })
  needsReview: boolean;
}

export class AdminPaymentListDto {
  @ApiProperty({ type: [AdminPaymentItemDto] }) data: AdminPaymentItemDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class AdminPaymentsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

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

export class AdminChangePlanDto {
  @ApiProperty({ example: 'PREMIUM' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z_]{2,20}$/)
  planCode: string;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason: string;
}
