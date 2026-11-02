import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ServiceAreaInputDto } from '../../auth/dto/register.dto';
import {
  AttentionStatus,
  CertStatus,
  ExceptionType,
  MediaPurpose,
  MediaStatus,
  ProItemStatus,
  RateMode,
  SocialNetwork,
} from '../professional.enums';
import {
  THEME_ANIMATIONS,
  THEME_COLORS,
  THEME_FONTS,
  THEME_HEADLINE_MAX,
  type ThemeColor,
} from '../profile-theme';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** `null` borra el campo; `undefined` lo deja como está. */
const nullable = (_: object, value: unknown) => value !== null;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------------------------
// Entradas

export class UpdateProfessionalProfileDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @ValidateIf(nullable)
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  businessName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200, description: 'Descripción (FI §7.1)' })
  @IsOptional()
  @ValidateIf(nullable)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  bio?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 70 })
  @IsOptional()
  @ValidateIf(nullable)
  @IsInt()
  @Min(0)
  @Max(70)
  yearsExperience?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() worksWithTeam?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasMobility?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() freeQuote?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoStatusFromSchedule?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Tarifa de referencia en ARS. Va junto con rateMode (los dos o ninguno).',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  referenceRate?: number | null;

  @ApiPropertyOptional({ enum: RateMode, nullable: true })
  @IsOptional()
  @ValidateIf(nullable)
  @IsEnum(RateMode)
  rateMode?: RateMode | null;
}

class ThemeGradientDto {
  @ApiProperty({ enum: THEME_COLORS }) @IsIn(THEME_COLORS) from: ThemeColor;
  @ApiProperty({ enum: THEME_COLORS }) @IsIn(THEME_COLORS) to: ThemeColor;
}

/** Personalización (opciones cerradas). Lo que el plan no admite responde 403. */
export class ProfileThemeDto {
  @ApiPropertyOptional({ enum: THEME_COLORS })
  @IsOptional()
  @IsIn(THEME_COLORS)
  color?: ThemeColor;

  @ApiPropertyOptional({ type: ThemeGradientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeGradientDto)
  gradient?: ThemeGradientDto;

  @ApiPropertyOptional({ enum: THEME_FONTS })
  @IsOptional()
  @IsIn(THEME_FONTS)
  font?: (typeof THEME_FONTS)[number];

  @ApiPropertyOptional({ maxLength: THEME_HEADLINE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, THEME_HEADLINE_MAX)
  headline?: string;

  @ApiPropertyOptional({ enum: THEME_ANIMATIONS, description: 'Solo Premium' })
  @IsOptional()
  @IsIn(THEME_ANIMATIONS)
  animation?: (typeof THEME_ANIMATIONS)[number];
}

export class AttentionStatusDto {
  @ApiProperty({ enum: AttentionStatus })
  @IsEnum(AttentionStatus)
  status: AttentionStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Hasta cuándo vale (máximo 7 días). Sin fecha, vale hasta que lo cambie.',
  })
  @IsOptional()
  @ValidateIf(nullable)
  @IsDateString({ strict: true })
  until?: string | null;
}

export class ReplaceProfessionsDto {
  @ApiProperty({ type: [String], description: 'Entre 1 y lo que permita el plan' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionIds: string[];

  @ApiProperty({ format: 'uuid', description: 'Profesión principal (una de las anteriores)' })
  @IsUUID()
  primaryId: string;
}

export class ReplaceServiceAreasDto {
  @ApiProperty({ type: [ServiceAreaInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaInputDto)
  serviceAreas: ServiceAreaInputDto[];
}

export class AddMediaDto {
  @ApiProperty({ format: 'uuid', description: 'Archivo PROFILE_MEDIA propio, confirmado' })
  @IsUUID()
  fileId: string;

  @ApiProperty({
    enum: MediaPurpose,
    description:
      'Imagen: PRESENTATION, WORK o BANNER. Video: CATALOG_VIDEO, PROFILE_VIDEO o BANNER.',
  })
  @IsEnum(MediaPurpose)
  purpose: MediaPurpose;
}

export class ReorderMediaDto {
  @ApiProperty({ type: [String], description: 'Todos los ids de medios, en el orden nuevo' })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class AddCertificationDto {
  @ApiProperty({ format: 'uuid', description: 'Archivo CERTIFICATE propio, confirmado' })
  @IsUUID()
  fileId: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  title: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  institution?: string;

  @ApiPropertyOptional({ minimum: 1950 })
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(new Date().getFullYear() + 1)
  issuedYear?: number;

  @ApiProperty({
    description:
      'Obligatorio (ADR 0020): el documento no muestra DNI, dirección ni fecha de nacimiento, o están tapados.',
  })
  @Equals(true, { message: 'Confirmá que el documento no muestra datos sensibles.' })
  sensitiveDataConfirmed: boolean;
}

class SocialLinkInputDto {
  @ApiProperty({ enum: SocialNetwork }) @IsEnum(SocialNetwork) network: SocialNetwork;

  @ApiProperty({ description: 'https y del dominio de esa red' })
  @IsString()
  @MaxLength(300)
  url: string;
}

export class ReplaceSocialLinksDto {
  @ApiProperty({ type: [SocialLinkInputDto], description: 'Una por red; lista vacía = ninguna' })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkInputDto)
  links: SocialLinkInputDto[];
}

class AvailabilitySlotInputDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: '1 = lunes … 7 = domingo' })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: '08:00' }) @Matches(TIME) start: string;
  @ApiProperty({ example: '18:00' }) @Matches(TIME) end: string;
}

export class ReplaceAvailabilityDto {
  @ApiProperty({ type: [AvailabilitySlotInputDto], description: 'Hora de Córdoba' })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotInputDto)
  slots: AvailabilitySlotInputDto[];
}

export class AddAvailabilityExceptionDto {
  @ApiProperty({ example: '2026-12-24' }) @Matches(DATE) startDate: string;
  @ApiProperty({ example: '2026-12-26' }) @Matches(DATE) endDate: string;
  @ApiProperty({ enum: ExceptionType }) @IsEnum(ExceptionType) type: ExceptionType;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  note?: string;
}

export class HideContentDto {
  @ApiProperty({ minLength: 5, maxLength: 300, description: 'Motivo (auditado)' })
  @Transform(trim)
  @IsString()
  @Length(5, 300)
  reason: string;
}

// ---------------------------------------------------------------------------------------------
// Salidas

export class AttentionDto {
  @ApiProperty({ enum: AttentionStatus, description: 'Estado elegido a mano' })
  manual: AttentionStatus;
  @ApiProperty({ nullable: true, type: Date }) until: Date | null;
  @ApiProperty() autoFromSchedule: boolean;
  @ApiProperty({ enum: AttentionStatus, description: 'Estado que se muestra ahora' })
  effective: AttentionStatus;
}

export class ProfessionItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() isPrimary: boolean;
  @ApiProperty({ enum: ProItemStatus }) status: ProItemStatus;
}

export class ServiceAreaItemDto {
  @ApiProperty() localityId: string;
  @ApiProperty() localityName: string;
  @ApiProperty({ nullable: true, type: String, description: 'null = toda la localidad' })
  neighborhoodId: string | null;
  @ApiProperty({ nullable: true, type: String }) neighborhoodName: string | null;
}

export class MediaItemDto {
  @ApiProperty() id: string;
  @ApiProperty() fileId: string;
  @ApiProperty({ enum: MediaPurpose }) purpose: MediaPurpose;
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) kind: string;
  @ApiProperty() position: number;
  @ApiProperty({ enum: MediaStatus }) status: MediaStatus;
  @ApiProperty({ nullable: true, type: String }) url: string | null;
  @ApiProperty({ nullable: true, type: String }) hiddenReason: string | null;
}

export class CertificationItemDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, type: String }) institution: string | null;
  @ApiProperty({ nullable: true, type: Number }) issuedYear: number | null;
  @ApiProperty({ enum: ['IMAGE', 'DOCUMENT'] }) kind: string;
  @ApiProperty({ enum: CertStatus }) status: CertStatus;
  @ApiProperty({ nullable: true, type: String }) url: string | null;
  @ApiProperty({
    description: 'Siempre false: "certificado cargado por el profesional" (ADR 0020)',
  })
  verified: false;
  @ApiProperty({ nullable: true, type: String }) hiddenReason: string | null;
}

export class SocialLinkDto {
  @ApiProperty({ enum: SocialNetwork }) network: SocialNetwork;
  @ApiProperty() url: string;
}

export class AvailabilitySlotDto {
  @ApiProperty() weekday: number;
  @ApiProperty() start: string;
  @ApiProperty() end: string;
}

export class AvailabilityExceptionDto {
  @ApiProperty() id: string;
  @ApiProperty() startDate: string;
  @ApiProperty() endDate: string;
  @ApiProperty({ enum: ExceptionType }) type: ExceptionType;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
}

export class AvailabilityDto {
  @ApiProperty({ type: [AvailabilitySlotDto] }) slots: AvailabilitySlotDto[];
  @ApiProperty({ type: [AvailabilityExceptionDto], description: 'Las que no terminaron' })
  exceptions: AvailabilityExceptionDto[];
}

/** El perfil completo que ve y edita el propio profesional. */
export class ProfessionalMeDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true, type: String }) businessName: string | null;
  @ApiProperty({ nullable: true, type: String }) bio: string | null;
  @ApiProperty({ nullable: true, type: Number }) yearsExperience: number | null;
  @ApiProperty() worksWithTeam: boolean;
  @ApiProperty() hasMobility: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'Decimal como texto' })
  referenceRate: string | null;
  @ApiProperty({ enum: RateMode, nullable: true }) rateMode: RateMode | null;
  @ApiProperty() freeQuote: boolean;
  @ApiProperty({ type: ProfileThemeDto }) theme: ProfileThemeDto;
  @ApiProperty({ type: AttentionDto }) attention: AttentionDto;
  @ApiProperty({ type: [ProfessionItemDto] }) professions: ProfessionItemDto[];
  @ApiProperty({ type: [ServiceAreaItemDto] }) serviceAreas: ServiceAreaItemDto[];
  @ApiProperty({ type: [MediaItemDto] }) media: MediaItemDto[];
  @ApiProperty({ type: [CertificationItemDto] }) certifications: CertificationItemDto[];
  @ApiProperty({ type: [SocialLinkDto] }) socialLinks: SocialLinkDto[];
  @ApiProperty({ type: AvailabilityDto }) availability: AvailabilityDto;
}
