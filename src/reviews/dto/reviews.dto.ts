import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ContentStatus } from '../../common/content-status';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateReviewDto {
  @ApiProperty({ format: 'uuid', description: 'Contratación terminada propia' })
  @IsUUID()
  contractId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 1000)
  comment?: string | null;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, description: 'null lo borra' })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 1000)
  comment?: string | null;
}

export class ReviewReplyDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  body: string;
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
  @Max(50)
  limit = 20;
}

export class ReviewAuthorDto {
  @ApiProperty({ description: 'Nombre e inicial del apellido, o "Usuario eliminado"' })
  displayName: string;
}

export class ReviewReplyViewDto {
  @ApiProperty() body: string;
  @ApiProperty() repliedAt: Date;
}

export class PublicReviewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() rating: number;
  @ApiProperty({ nullable: true, type: String }) comment: string | null;
  @ApiProperty({ type: ReviewAuthorDto }) author: ReviewAuthorDto;
  @ApiProperty({ type: ReviewReplyViewDto, nullable: true }) reply: ReviewReplyViewDto | null;
  @ApiProperty() edited: boolean;
  @ApiProperty() createdAt: Date;
}

/** Lo que ven el autor y el profesional reseñado. */
export class OwnReviewDto extends PublicReviewDto {
  @ApiProperty({ format: 'uuid' }) contractId: string;
  @ApiProperty({ format: 'uuid' }) professionalId: string;
  @ApiProperty({ enum: ContentStatus }) status: ContentStatus;
  @ApiProperty({ nullable: true, type: String }) hiddenReason: string | null;
  @ApiProperty({ description: 'Hasta cuándo se puede editar (30 días desde que terminó)' })
  editableUntil: Date;
}

export class ReviewPageDto {
  @ApiProperty({ type: [PublicReviewDto] }) data: PublicReviewDto[];
  @ApiProperty({ nullable: true, type: Number, description: 'Promedio de 1 a 5, un decimal' })
  average: number | null;
  @ApiProperty() count: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

// ---- Reseñas de la plataforma ----

export class PlatformReviewInputDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 1000)
  comment?: string | null;
}

export class PlatformReviewDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() rating: number;
  @ApiProperty({ nullable: true, type: String }) comment: string | null;
  @ApiProperty({ type: ReviewAuthorDto }) author: ReviewAuthorDto;
  @ApiProperty() published: boolean;
  @ApiProperty() createdAt: Date;
}

export class PlatformReviewPageDto {
  @ApiProperty({ type: [PlatformReviewDto] }) data: PlatformReviewDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class AdminPlatformReviewsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  published?: boolean;
}
