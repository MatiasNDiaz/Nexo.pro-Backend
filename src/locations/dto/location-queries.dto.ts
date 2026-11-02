import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LocalitiesQueryDto {
  @IsUUID()
  provinceId: string;
}

export class NeighborhoodSearchQueryDto {
  @IsUUID()
  localityId: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  search: string;
}
