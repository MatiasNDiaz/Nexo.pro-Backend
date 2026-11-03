import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { FileKind } from '../../uploads/file.enums';
import { ForumPostType } from '../entities/forum.entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Hasta 4 profesiones etiquetadas; 2 imágenes y 1 video (FI §13.1). */
export const MAX_POST_PROFESSIONS = 4;
export const MAX_POST_IMAGES = 2;
export const MAX_POST_VIDEOS = 1;

export class CreateForumPostDto {
  @ApiProperty({ enum: ForumPostType })
  @IsEnum(ForumPostType)
  type: ForumPostType;

  @ApiProperty({ minLength: 5, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  body: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_POST_PROFESSIONS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POST_PROFESSIONS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Barrio aprobado de esa localidad' })
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @ApiPropertyOptional({ description: 'Presupuesto estimado en ARS' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(9_999_999_999)
  budgetEstimate?: number;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  deadline?: string;

  @ApiPropertyOptional({ type: [String], description: 'Archivos FORUM_MEDIA propios, confirmados' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POST_IMAGES + MAX_POST_VIDEOS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mediaFileIds?: string[];
}

/** Se edita el texto y los datos; null borra un dato opcional. Las fotos no se cambian. */
export class UpdateForumPostDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 2000)
  body?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_POST_PROFESSIONS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POST_PROFESSIONS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  localityId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  neighborhoodId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(9_999_999_999)
  budgetEstimate?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  deadline?: string | null;
}

export class CreateForumReplyDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  body: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Respuesta a la que contesta' })
  @IsOptional()
  @IsUUID()
  parentReplyId?: string;

  @ApiPropertyOptional({ description: 'Solo profesionales, en "Solicito profesional"' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(9_999_999_999)
  proposedPrice?: number;
}

export class UpdateForumReplyDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  body?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(9_999_999_999)
  proposedPrice?: number | null;
}

export class ForumQueryDto {
  @ApiPropertyOptional({ enum: ForumPostType })
  @IsOptional()
  @IsEnum(ForumPostType)
  type?: ForumPostType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  professionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  resolved?: boolean;

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
  @Max(50)
  limit = 20;
}

export class ForumAuthorDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty({ enum: ['CUSTOMER', 'PROFESSIONAL'] }) role: string;
  @ApiProperty({ description: 'Fecha de registro' }) memberSince: Date;
}

export class NamedRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class ForumMediaDto {
  @ApiProperty({ enum: FileKind }) kind: FileKind;
  @ApiProperty() url: string;
}

export class ForumPostDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ForumPostType }) type: ForumPostType;
  @ApiProperty() body: string;
  @ApiProperty({ type: ForumAuthorDto }) author: ForumAuthorDto;
  @ApiProperty({ type: [NamedRefDto] }) professions: NamedRefDto[];
  @ApiProperty({ type: NamedRefDto, nullable: true }) locality: NamedRefDto | null;
  @ApiProperty({ type: NamedRefDto, nullable: true }) neighborhood: NamedRefDto | null;
  @ApiProperty({ nullable: true, type: String }) budgetEstimate: string | null;
  @ApiProperty({ nullable: true, type: String }) deadline: string | null;
  @ApiProperty() resolved: boolean;
  @ApiProperty({ type: [ForumMediaDto] }) media: ForumMediaDto[];
  @ApiProperty() likeCount: number;
  @ApiProperty() replyCount: number;
  @ApiProperty() edited: boolean;
  @ApiProperty() createdAt: Date;
}

export class ForumReplyDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) parentReplyId: string | null;
  @ApiProperty({ type: ForumAuthorDto, nullable: true }) author: ForumAuthorDto | null;
  @ApiProperty({ description: 'Vacío si se borró o la ocultó el admin' }) body: string;
  @ApiProperty({ nullable: true, type: String }) proposedPrice: string | null;
  @ApiProperty({ description: 'Borrada o oculta: queda el lugar para las respuestas a ella' })
  removed: boolean;
  @ApiProperty() likeCount: number;
  @ApiProperty() edited: boolean;
  @ApiProperty() createdAt: Date;
}

export class ForumPostDetailDto extends ForumPostDto {
  @ApiProperty({ type: [ForumReplyDto], description: 'En orden; se anidan con parentReplyId' })
  replies: ForumReplyDto[];
}

export class ForumPageDto {
  @ApiProperty({ type: [ForumPostDto] }) data: ForumPostDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class ForumLikesDto {
  @ApiProperty() post: boolean;
  @ApiProperty({ type: [String] }) replyIds: string[];
}
