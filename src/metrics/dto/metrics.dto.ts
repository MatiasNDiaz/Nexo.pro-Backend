import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';
import type { GroupBy } from '../../common/calendar-periods';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const METRICS_GROUP_BY = ['day', 'week', 'month'] as const;
export type MetricsGroupBy = Extract<GroupBy, (typeof METRICS_GROUP_BY)[number]>;

export class MetricsQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Desde (incluido). Defecto: día 1 del mes',
  })
  @IsOptional()
  @Matches(DAY)
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Hasta (incluido). Defecto: hoy' })
  @IsOptional()
  @Matches(DAY)
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ enum: METRICS_GROUP_BY, default: 'day' })
  @IsOptional()
  @IsIn(METRICS_GROUP_BY)
  groupBy: MetricsGroupBy = 'day';
}

export class MetricsValuesDto {
  @ApiProperty({ description: 'Personas distintas que abrieron el perfil (por día, sumadas)' })
  profileViewers: number;
  @ApiProperty({ description: 'Personas distintas que lo vieron en resultados (por día, sumadas)' })
  searchAppearances: number;
  @ApiProperty({ description: 'Veces que estuvo primero en la primera página (personas por día)' })
  firstPlace: number;
  @ApiProperty({ description: 'Pedidos que le llegaron' }) requests: number;
  @ApiProperty({ description: 'Trabajos terminados' }) completed: number;
  @ApiProperty({ description: 'Reseñas recibidas' }) ratingCount: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Promedio de esas reseñas (1 a 5)' })
  ratingAverage: number | null;
}

export class MetricsBucketDto extends MetricsValuesDto {
  @ApiProperty({ example: '2026-11-01', description: 'Comienzo del período' }) start: string;
}

export class MetricsPreviousDto extends MetricsValuesDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
}

export class OverallRatingDto {
  @ApiProperty() count: number;
  @ApiProperty({ nullable: true, type: Number }) average: number | null;
}

export class ProfessionalMetricsDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty({ enum: METRICS_GROUP_BY }) groupBy: MetricsGroupBy;
  @ApiProperty({ type: [MetricsBucketDto] }) buckets: MetricsBucketDto[];
  @ApiProperty({ type: MetricsValuesDto }) total: MetricsValuesDto;
  @ApiProperty({ type: MetricsPreviousDto, description: 'Mismo tramo, un período antes' })
  previous: MetricsPreviousDto;
  @ApiProperty({ type: OverallRatingDto, description: 'Todas sus reseñas visibles' })
  overallRating: OverallRatingDto;
}
