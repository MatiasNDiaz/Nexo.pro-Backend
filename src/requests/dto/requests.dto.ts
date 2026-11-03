import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ContractStatus,
  QuoteStatus,
  RequestStatus,
  RequestUrgency,
  TargetStatus,
} from '../request.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Tope técnico contra el spam: a cuántos profesionales se manda un mismo pedido. */
export const MAX_TARGETS = 10;

export class CreateRequestDto {
  @ApiProperty({
    type: [String],
    description: `Usuarios de los profesionales (1 a ${MAX_TARGETS})`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TARGETS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionalIds: string[];

  @ApiProperty({ format: 'uuid', description: 'Oficio (los profesionales tienen que ofrecerlo)' })
  @IsUUID()
  professionId: string;

  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @Length(5, 1000)
  description: string;

  @ApiProperty({ enum: RequestUrgency })
  @IsEnum(RequestUrgency)
  urgency: RequestUrgency;
}

/** Cancelar o rechazar: la justificación es opcional (FI §11.4). */
export class ReasonDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  reason?: string;
}

export class SendQuoteDto {
  @ApiProperty({ description: 'Importe en ARS' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  amount: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Fecha propuesta para el trabajo' })
  @IsOptional()
  @IsDateString({ strict: true })
  proposedDate?: string;
}

export class SelectTargetDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Presupuesto vigente que acepta (opcional)' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;
}

export class ScheduleDto {
  @ApiProperty({ description: 'Fecha y hora acordadas' })
  @IsDateString({ strict: true })
  scheduledAt: string;
}

export class QuoteDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: string;
  @ApiProperty() currency: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: Date }) proposedDate: Date | null;
  @ApiProperty({ enum: QuoteStatus }) status: QuoteStatus;
  @ApiProperty() createdAt: Date;
}

export class TargetDto {
  @ApiProperty() id: string;
  @ApiProperty() requestId: string;
  @ApiProperty() professionalId: string;
  @ApiProperty() conversationId: string;
  @ApiProperty({ enum: TargetStatus }) status: TargetStatus;
  @ApiProperty({ nullable: true, type: QuoteDto, description: 'Presupuesto vigente' })
  currentQuote: QuoteDto | null;
}

export class RequestDto {
  @ApiProperty() id: string;
  @ApiProperty() customerId: string;
  @ApiProperty() professionId: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: RequestUrgency }) urgency: RequestUrgency;
  @ApiProperty({ enum: RequestStatus }) status: RequestStatus;
  @ApiProperty({ type: [TargetDto], description: 'El profesional solo ve el suyo' })
  targets: TargetDto[];
  @ApiProperty({ nullable: true, type: String }) contractId: string | null;
  @ApiProperty() createdAt: Date;
}

export class ContractDto {
  @ApiProperty() id: string;
  @ApiProperty() requestId: string;
  @ApiProperty() customerId: string;
  @ApiProperty() professionalId: string;
  @ApiProperty() conversationId: string;
  @ApiProperty({ enum: ContractStatus }) status: ContractStatus;
  @ApiProperty({ nullable: true, type: QuoteDto }) acceptedQuote: QuoteDto | null;
  @ApiProperty({ nullable: true, type: Date }) scheduledAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) startedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) completedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) cancelledAt: Date | null;
  @ApiProperty({ nullable: true, type: String }) cancelReason: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({
    description: 'C-30: al empezar, sugerencia para el estado de atención (no se cambia solo)',
  })
  suggestedAttentionStatus?: 'WORKING';
}
