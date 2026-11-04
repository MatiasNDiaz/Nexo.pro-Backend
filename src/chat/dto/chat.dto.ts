import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MessageSender } from '../entities/chat.entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MESSAGE_MAX_LENGTH = 2000;
export const MAX_ATTACHMENTS = 5;

export class OpenConversationDto {
  @ApiProperty({ format: 'uuid', description: 'Usuario del profesional (visible en el catálogo)' })
  @IsUUID()
  professionalId: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({ maxLength: MESSAGE_MAX_LENGTH })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body?: string;

  @ApiPropertyOptional({
    type: [String],
    description: `Archivos CHAT_ATTACHMENT propios y confirmados (hasta ${MAX_ATTACHMENTS})`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

export class EditMessageDto {
  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Mensajes anteriores a esta fecha (paginación hacia atrás)' })
  @IsOptional()
  @IsDateString({ strict: true })
  before?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 30;
}

export class AttachmentDto {
  @ApiProperty() fileId: string;
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) kind: string;
  @ApiProperty({ nullable: true, type: String }) mimeType: string | null;
}

/** Lo que ven los participantes. Nunca incluye la versión original (ADR 0024). */
export class MessageDto {
  @ApiProperty() id: string;
  @ApiProperty() conversationId: string;
  @ApiProperty({ enum: MessageSender }) senderType: MessageSender;
  @ApiProperty({ nullable: true, type: String }) senderId: string | null;
  @ApiProperty({ description: 'Vacío si se eliminó' }) body: string;
  @ApiProperty() edited: boolean;
  @ApiProperty() deleted: boolean;
  @ApiProperty({ nullable: true, type: String }) serviceRequestId: string | null;
  @ApiProperty({ type: [AttachmentDto] }) attachments: AttachmentDto[];
  @ApiProperty() createdAt: Date;
}

export class CounterpartDto {
  @ApiProperty() userId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty({
    description:
      'true si dio de baja su cuenta: el chat queda de solo lectura. Anonimizada, se llama «Cuenta eliminada»',
  })
  deactivated: boolean;
  @ApiPropertyOptional({
    description: 'Solo si es profesional; null si dio de baja su cuenta',
    nullable: true,
    type: String,
  })
  slug?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) businessName?: string | null;
  @ApiPropertyOptional({ description: 'Solo si es cliente (C-13)' }) neighborhoodName?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) extraInfo?: string | null;
}

export class ConversationDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['CUSTOMER', 'PROFESSIONAL'] }) myRole: 'CUSTOMER' | 'PROFESSIONAL';
  @ApiProperty({ type: CounterpartDto }) counterpart: CounterpartDto;
  @ApiProperty({ nullable: true, type: MessageDto }) lastMessage: MessageDto | null;
  @ApiProperty() unread: number;
  @ApiProperty({ nullable: true, type: Date, description: 'Hasta dónde leyó el otro' })
  counterpartReadAt: Date | null;
  @ApiProperty({
    description:
      'false si no se pueden mandar mensajes (profesional sin plan o cuenta dada de baja)',
  })
  canWrite: boolean;
  @ApiProperty({ nullable: true, type: Date }) lastMessageAt: Date | null;
}
