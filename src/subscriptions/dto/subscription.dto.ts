import { ApiProperty } from '@nestjs/swagger';
import { ThemeLevel } from '../entities/subscription-plan.entity';
import { SubscriptionStatus } from '../entities/subscription.entity';

export class PlanLimitsDto {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() maxProfessions: number;
  @ApiProperty() maxImages: number;
  @ApiProperty() maxVideos: number;
  @ApiProperty() maxVideoSeconds: number;
  @ApiProperty() maxImageBytes: number;
  @ApiProperty() maxVideoBytes: number;
  @ApiProperty({ enum: ThemeLevel }) themeLevel: ThemeLevel;
}

export class SubscriptionSummaryDto {
  @ApiProperty({ enum: SubscriptionStatus, nullable: true }) status: SubscriptionStatus | null;
  @ApiProperty({ description: 'true si la prueba o el plan están vigentes' }) live: boolean;
  @ApiProperty({ type: PlanLimitsDto, nullable: true }) plan: PlanLimitsDto | null;
  @ApiProperty({ nullable: true, type: Date }) trialEndsAt: Date | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Contador de la prueba (ADR 0017): 30 al registrarse, 1 el último día',
  })
  trialDaysLeft: number | null;
  @ApiProperty({
    nullable: true,
    type: Date,
    description: 'Hasta cuándo está pago (incluye los meses pagados por adelantado)',
  })
  currentPeriodEnd: Date | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Días que quedan del período pago' })
  periodDaysLeft: number | null;
}
