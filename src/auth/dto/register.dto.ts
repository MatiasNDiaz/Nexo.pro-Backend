import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NEIGHBORHOOD_NAME_MAX, NEIGHBORHOOD_NAME_MIN } from '../../locations/neighborhood-name';
import { SELF_REGISTRABLE_ROLES, UserRole } from '../../users/user.enums';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../services/password.service';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
/** Teléfono: se descartan espacios, guiones y paréntesis antes de validar. */
export const phoneDigits = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value;

export const PERSON_NAME = /^\p{L}[\p{L} '.-]*$/u;
export const PHONE_PATTERN = /^\+?\d{8,15}$/;

export class NeighborhoodInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  localityId: string;

  @ApiProperty({ example: 'Nueva Córdoba', description: 'Nombre existente o uno nuevo' })
  @Transform(trim)
  @IsString()
  @Length(NEIGHBORHOOD_NAME_MIN, NEIGHBORHOOD_NAME_MAX)
  name: string;
}

export class ServiceAreaInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  localityId: string;

  @ApiPropertyOptional({ description: 'Si se omite, cubre toda la localidad' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(NEIGHBORHOOD_NAME_MIN, NEIGHBORHOOD_NAME_MAX)
  neighborhoodName?: string;
}

/**
 * Paso 1 del registro (ADR 0006). El rol solo puede ser CUSTOMER o PROFESSIONAL: ADMIN se crea por
 * CLI. Cliente: barrio donde vive. Profesional: profesión principal y zonas donde trabaja.
 */
export class RegisterDto {
  @ApiProperty({ enum: SELF_REGISTRABLE_ROLES })
  @IsIn(SELF_REGISTRABLE_ROLES)
  role: UserRole;

  @ApiProperty({ example: 'ana@example.com' })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH.user, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH.user)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  @Matches(PERSON_NAME)
  firstName: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  @Matches(PERSON_NAME)
  lastName: string;

  @ApiProperty({ example: '+5493511234567' })
  @Transform(phoneDigits)
  @IsString()
  @Matches(PHONE_PATTERN)
  phone: string;

  @ApiPropertyOptional({ type: NeighborhoodInputDto, description: 'Obligatorio para clientes' })
  @ValidateIf((dto: RegisterDto) => dto.role === UserRole.CUSTOMER)
  @ValidateNested()
  @Type(() => NeighborhoodInputDto)
  neighborhood?: NeighborhoodInputDto;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatoria para profesionales' })
  @ValidateIf((dto: RegisterDto) => dto.role === UserRole.PROFESSIONAL)
  @IsUUID()
  professionId?: string;

  @ApiPropertyOptional({ type: [ServiceAreaInputDto], description: 'Profesionales: 1 a 20 zonas' })
  @ValidateIf((dto: RegisterDto) => dto.role === UserRole.PROFESSIONAL)
  @IsArray()
  @ArrayMinSize(1)
  // Tope duro de la validación; el configurable (MAX_SERVICE_AREAS) lo aplica el servicio.
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaInputDto)
  serviceAreas?: ServiceAreaInputDto[];
}
