import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  AttentionStatus,
  ExceptionType,
  MediaPurpose,
  RateMode,
  SocialNetwork,
} from '../../professionals/professional.enums';
import { ProfileThemeDto } from '../../professionals/dto/professional-profile.dto';

export class CatalogQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  professionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  localityId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Barrio aprobado. Incluye a quienes cubren toda la localidad.',
  })
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @ApiPropertyOptional({ description: 'Solo los disponibles en este momento ("Disponible ya")' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  availableNow?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class PublicProfessionDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() isPrimary: boolean;
}

/** Zonas públicas: solo barrios aprobados o toda la localidad (ADR 0010). */
export class PublicAreaDto {
  @ApiProperty() localityId: string;
  @ApiProperty() localityName: string;
  @ApiProperty({ nullable: true, type: String, description: 'null = toda la localidad' })
  neighborhoodId: string | null;
  @ApiProperty({ nullable: true, type: String }) neighborhoodName: string | null;
}

export class CatalogItemDto {
  @ApiProperty() slug: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ nullable: true, type: String }) businessName: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty({ nullable: true, type: String }) bio: string | null;
  @ApiProperty({ nullable: true, type: Number }) yearsExperience: number | null;
  @ApiProperty({ nullable: true, type: String }) referenceRate: string | null;
  @ApiProperty({ enum: RateMode, nullable: true }) rateMode: RateMode | null;
  @ApiProperty() freeQuote: boolean;
  @ApiProperty({ enum: AttentionStatus, description: 'Estado que se muestra ahora' })
  attentionStatus: AttentionStatus;
  @ApiProperty({ description: 'Siempre true: el catálogo solo muestra identidades aprobadas' })
  identityVerified: true;
  @ApiProperty({ type: [PublicProfessionDto] }) professions: PublicProfessionDto[];
  @ApiProperty({ type: [PublicAreaDto] }) serviceAreas: PublicAreaDto[];
  @ApiProperty({ nullable: true, type: String, description: 'Primera imagen de presentación' })
  coverImageUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Video de presentación en catálogo' })
  catalogVideoUrl: string | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Promedio de estrellas (un decimal)' })
  ratingAverage: number | null;
  @ApiProperty({ description: 'Cantidad de reseñas visibles' })
  ratingCount: number;
}

export class CatalogPageDto {
  @ApiProperty({ type: [CatalogItemDto] }) data: CatalogItemDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class PublicMediaDto {
  @ApiProperty({ enum: MediaPurpose }) purpose: MediaPurpose;
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) kind: string;
  @ApiProperty() url: string;
}

export class PublicCertificationDto {
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) institution: string | null;
  @ApiProperty({ nullable: true, type: Number }) issuedYear: number | null;
  @ApiProperty({ enum: ['IMAGE', 'DOCUMENT'] }) kind: string;
  @ApiProperty() url: string;
  @ApiProperty({
    description: 'Siempre false: "certificado cargado por el profesional" (ADR 0020)',
  })
  verified: false;
}

export class PublicSocialLinkDto {
  @ApiProperty({ enum: SocialNetwork }) network: SocialNetwork;
  @ApiProperty() url: string;
}

export class PublicAvailabilityDto {
  @ApiProperty({ description: '1 = lunes … 7 = domingo; hora de Córdoba' })
  slots: Array<{ weekday: number; start: string; end: string }>;
  @ApiProperty({ description: 'Próximos días sin atención' })
  exceptions: Array<{ startDate: string; endDate: string; type: ExceptionType }>;
}

/** Página pública del profesional. Email y teléfono visibles (FI §7.1), solo en el detalle (C-19). */
export class PublicProfileDto extends CatalogItemDto {
  @ApiProperty() worksWithTeam: boolean;
  @ApiProperty() hasMobility: boolean;
  @ApiProperty() email: string;
  @ApiProperty() phone: string;
  @ApiProperty({ type: ProfileThemeDto, description: 'Solo lo que admite su plan actual' })
  theme: ProfileThemeDto;
  @ApiProperty({ type: PublicMediaDto, nullable: true }) banner: PublicMediaDto | null;
  @ApiProperty({ type: [PublicMediaDto] }) media: PublicMediaDto[];
  @ApiProperty({ type: [PublicCertificationDto] }) certifications: PublicCertificationDto[];
  @ApiProperty({ type: [PublicSocialLinkDto] }) socialLinks: PublicSocialLinkDto[];
  @ApiProperty({ type: PublicAvailabilityDto }) availability: PublicAvailabilityDto;
}
