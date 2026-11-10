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
  HEX_COLOR,
  SECTION_ANIMATIONS,
  SECTION_SIZES,
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

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Estilo de una sección (ADR 0034). Colores solo `#rrggbb`; tamaño y animación de listas cerradas. */
export class SectionStyleDto {
  @ApiPropertyOptional({ example: '#123b7a', pattern: HEX_COLOR.source })
  @IsOptional()
  @Transform(lower)
  @IsString()
  @Matches(HEX_COLOR)
  background?: string;

  @ApiPropertyOptional({ example: '#0b1f3a', description: 'Degradé con `background` (solo Premium)' })
  @IsOptional()
  @Transform(lower)
  @IsString()
  @Matches(HEX_COLOR)
  backgroundTo?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @Transform(lower)
  @IsString()
  @Matches(HEX_COLOR)
  text?: string;

  @ApiPropertyOptional({ enum: SECTION_SIZES, description: 'Escala en %, solo Premium' })
  @IsOptional()
  @IsIn(SECTION_SIZES)
  size?: (typeof SECTION_SIZES)[number];

  @ApiPropertyOptional({ enum: SECTION_ANIMATIONS, description: 'Solo Premium' })
  @IsOptional()
  @IsIn(SECTION_ANIMATIONS)
  animation?: (typeof SECTION_ANIMATIONS)[number];
}

/** Una propiedad opcional por sección de THEME_SECTIONS: cualquier otra clave responde 400. */
export class ThemeSectionsDto {
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) pagina?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) presentacion?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) datos?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) sobre?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) trabajos?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) certificados?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) resenas?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) contacto?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) zonas?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) horarios?: SectionStyleDto;
  @ApiPropertyOptional({ type: SectionStyleDto }) @IsOptional() @ValidateNested() @Type(() => SectionStyleDto) redes?: SectionStyleDto;
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

  @ApiPropertyOptional({
    type: ThemeSectionsDto,
    description: 'Estilo por sección (ADR 0034). Medium: fondo y letra; Premium: además degradé, tamaño y animación',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeSectionsDto)
  sections?: ThemeSectionsDto;
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

/** Qué mostrar dentro del límite del plan (ADR 0026): lo que no se manda queda oculto. */
export class VisibleMediaDto {
  @ApiProperty({ type: [String], description: 'Ids de las imágenes y videos a mostrar' })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class VisibleProfessionsDto {
  @ApiProperty({
    type: [String],
    description: 'Ids de las profesiones a mostrar (con la principal)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionIds: string[];
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

/** El admin edita el perfil de un profesional (ADR 0021): mismos campos, más el motivo. */
export class AdminUpdateProfessionalProfileDto extends UpdateProfessionalProfileDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason: string;
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
