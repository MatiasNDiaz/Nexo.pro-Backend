import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SupportCategory, TicketStatus } from '../entities/support.entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateTicketDto {
  @ApiProperty({ enum: SupportCategory })
  @IsEnum(SupportCategory)
  category: SupportCategory;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  body: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Una foto (archivo EVIDENCE propio)' })
  @IsOptional()
  @IsUUID()
  fileId?: string;
}

/** Formulario de contacto público (FI §2.4): sin cuenta, 3 por hora por IP. */
export class ContactDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ enum: SupportCategory })
  @IsEnum(SupportCategory)
  category: SupportCategory;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  body: string;
}

export class TicketMessageInputDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  body: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  fileId?: string;
}

export class AdminTicketReplyDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  body: string;
}

export class TicketMessageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() fromStaff: boolean;
  @ApiProperty() body: string;
  @ApiProperty({ nullable: true, type: String, description: 'Ver con GET /evidence/:fileId' })
  fileId: string | null;
  @ApiProperty() createdAt: Date;
}

export class TicketDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: SupportCategory }) category: SupportCategory;
  @ApiProperty({ enum: TicketStatus }) status: TicketStatus;
  @ApiProperty({ type: [TicketMessageDto] }) messages: TicketMessageDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class AdminTicketDto extends TicketDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) userId: string | null;
  @ApiProperty({ description: 'Email de la cuenta o del formulario público' }) email: string;
  @ApiProperty({ nullable: true, type: String }) name: string | null;
}

export class PageQueryDto {
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

export class AdminTicketsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}

// ---- Novedades ----

export class AnnouncementSegmentDto {
  @ApiPropertyOptional({ enum: ['CUSTOMER', 'PROFESSIONAL'], isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['CUSTOMER', 'PROFESSIONAL'], { each: true })
  roles?: Array<'CUSTOMER' | 'PROFESSIONAL'>;

  @ApiPropertyOptional({ type: [String], description: 'Profesionales que ofrecen alguno' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Profesionales con alguno de esos planes vigente',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(/^[A-Z_]{2,20}$/, { each: true })
  planCodes?: string[];
}

export class CreateAnnouncementDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(3, 2000)
  body: string;

  @ApiPropertyOptional({ type: AnnouncementSegmentDto, description: 'Vacío = todos' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnnouncementSegmentDto)
  segment?: AnnouncementSegmentDto;
}

export class AnnouncementDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty({ nullable: true, type: Date }) publishedAt: Date | null;
}

export class AdminAnnouncementDto extends AnnouncementDto {
  @ApiProperty({ type: AnnouncementSegmentDto }) segment: AnnouncementSegmentDto;
  @ApiProperty({ description: 'A cuántas personas les llegó' }) recipients: number;
}

export class AdminMessageDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  body: string;
}
