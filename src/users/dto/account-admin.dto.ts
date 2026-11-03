import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NeighborhoodInputDto, ServiceAreaInputDto } from '../../auth/dto/register.dto';
import { AccountStatus, SELF_REGISTRABLE_ROLES, UserRole } from '../user.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Toda acción del admin sobre una cuenta lleva motivo; queda en la auditoría. */
export class AccountActionDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason: string;
}

/**
 * Cambio de rol por el admin (ADR 0012). Solo entre CUSTOMER y PROFESSIONAL. Los datos del rol
 * nuevo son los mismos del registro: barrio para cliente, profesión y zonas para profesional.
 * Si el usuario ya tuvo ese rol, se reutilizan sus datos anteriores salvo que se manden nuevos.
 */
export class ChangeRoleDto extends AccountActionDto {
  @ApiProperty({ enum: SELF_REGISTRABLE_ROLES })
  @IsIn(SELF_REGISTRABLE_ROLES)
  role: UserRole;

  @ApiPropertyOptional({ type: NeighborhoodInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NeighborhoodInputDto)
  neighborhood?: NeighborhoodInputDto;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  professionId?: string;

  @ApiPropertyOptional({ type: [ServiceAreaInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaInputDto)
  serviceAreas?: ServiceAreaInputDto[];
}

/**
 * Baja de la propia cuenta: exige la contraseña (reautenticación, SEG §13.3). Una cuenta sin
 * contraseña (solo Google) la omite y necesita un inicio de sesión reciente (ADR 0023).
 */
export class DeleteOwnAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

export class AccountSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
}
