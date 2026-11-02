import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NeighborhoodStatus } from '../entities/neighborhood.entity';
import { NEIGHBORHOOD_NAME_MAX, NEIGHBORHOOD_NAME_MIN } from '../neighborhood-name';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListNeighborhoodsQueryDto {
  @ApiPropertyOptional({ enum: NeighborhoodStatus, default: NeighborhoodStatus.PENDING })
  @IsOptional()
  @IsEnum(NeighborhoodStatus)
  status: NeighborhoodStatus = NeighborhoodStatus.PENDING;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({ maxLength: NEIGHBORHOOD_NAME_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(NEIGHBORHOOD_NAME_MAX)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

/** Motivo opcional: queda en la auditoría. */
export class ModerationReasonDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  reason?: string;
}

export class RenameNeighborhoodDto extends ModerationReasonDto {
  @ApiProperty({
    minLength: NEIGHBORHOOD_NAME_MIN,
    maxLength: NEIGHBORHOOD_NAME_MAX,
    description: 'Nombre tal como se va a mostrar (se respetan las mayúsculas)',
  })
  @IsString()
  @MaxLength(NEIGHBORHOOD_NAME_MAX * 2)
  name: string;
}

export class MergeNeighborhoodDto extends ModerationReasonDto {
  @ApiProperty({ format: 'uuid', description: 'Barrio APROBADO de la misma localidad' })
  @IsUUID()
  targetId: string;
}

export class NeighborhoodUsageDto {
  @ApiProperty({ description: 'Clientes que viven ahí' }) residents: number;
  @ApiProperty({ description: 'Zonas de trabajo de profesionales' }) serviceAreas: number;
}

export class AdminNeighborhoodDto {
  @ApiProperty() id: string;
  @ApiProperty() localityId: string;
  @ApiProperty() name: string;
  @ApiProperty() normalizedName: string;
  @ApiProperty({ enum: NeighborhoodStatus }) status: NeighborhoodStatus;
  @ApiProperty({ nullable: true, type: String }) mergedIntoId: string | null;
  @ApiProperty({ nullable: true, type: String }) createdByUserId: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedById: string | null;
  @ApiProperty({ nullable: true, type: Date }) reviewedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: NeighborhoodUsageDto }) usage: NeighborhoodUsageDto;
}

export class AdminNeighborhoodListDto {
  @ApiProperty({ type: [AdminNeighborhoodDto] }) data: AdminNeighborhoodDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
