import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class SaveFavoriteDto {
  @ApiPropertyOptional({
    description: 'Aviso cuando se pone "Disponible" (planes Medium y Premium)',
  })
  @IsOptional()
  @IsBoolean()
  availabilityAlerts?: boolean;
}

export class FavoriteAlertsDto {
  @ApiProperty()
  @IsBoolean()
  availabilityAlerts: boolean;
}

export class FavoriteDto {
  @ApiProperty({ format: 'uuid' }) professionalId: string;
  @ApiProperty({ description: 'false si hoy no aparece en el catálogo' }) listed: boolean;
  @ApiProperty({ nullable: true, type: String }) slug: string | null;
  @ApiProperty({ nullable: true, type: String }) firstName: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName: string | null;
  @ApiProperty({ nullable: true, type: String }) businessName: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty() availabilityAlerts: boolean;
  @ApiProperty({ description: 'Si su plan incluye los avisos de disponibilidad' })
  alertsAvailable: boolean;
  @ApiProperty() createdAt: Date;
}
