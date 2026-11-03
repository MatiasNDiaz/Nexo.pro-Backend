import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  NeighborhoodInputDto,
  PERSON_NAME,
  PHONE_PATTERN,
  phoneDigits,
  trim,
} from '../../auth/dto/register.dto';

/** Datos personales que edita el propio usuario (ADR 0021). Lo que no se manda no cambia. */
export class UpdatePersonalDataDto {
  @ApiPropertyOptional({
    maxLength: 60,
    description: 'Con la identidad aprobada queda en revisión del admin (ADR 0021)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  @Matches(PERSON_NAME)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  @Matches(PERSON_NAME)
  lastName?: string;

  @ApiPropertyOptional({ example: '+5493511234567' })
  @IsOptional()
  @Transform(phoneDigits)
  @IsString()
  @Matches(PHONE_PATTERN)
  phone?: string;

  @ApiPropertyOptional({
    type: NeighborhoodInputDto,
    description: 'Solo clientes: barrio donde vive',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NeighborhoodInputDto)
  neighborhood?: NeighborhoodInputDto;
}

/** El admin edita datos de un cliente o profesional: se aplican directamente, con motivo. */
export class AdminUpdatePersonalDataDto extends UpdatePersonalDataDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 300, description: 'Solo clientes' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  extraInfo?: string | null;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class PersonalDataDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'Nombre vigente (el que se ve en público)' }) firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ nullable: true, type: String, description: 'Nombre en revisión (ADR 0021)' })
  pendingFirstName: string | null;
  @ApiProperty({ nullable: true, type: String }) pendingLastName: string | null;
  @ApiProperty() phone: string;
  @ApiProperty({ nullable: true, type: String }) neighborhoodId: string | null;
  @ApiProperty({ nullable: true, type: String }) neighborhoodName: string | null;
}
