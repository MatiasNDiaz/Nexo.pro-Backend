import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { SanctionDto, StrikeDto } from '../../moderation/dto/moderation.dto';
import { AccountStatus, UserRole } from '../../users/user.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DashboardDto {
  @ApiProperty({ type: Object, description: 'Clientes y profesionales' })
  usersByRole: Record<string, number>;
  @ApiProperty({ type: Object }) usersByStatus: Record<string, number>;
  @ApiProperty({ type: Object, description: 'Última suscripción de cada profesional' })
  subscriptionsByStatus: Record<string, number>;
  @ApiProperty({ type: Object, description: 'Con prueba o plan vigente' })
  professionalsByPlan: Record<string, number>;
  @ApiProperty() newUsersLast7Days: number;
  @ApiProperty() newForumPostsLast7Days: number;
  @ApiProperty() newReportsLast7Days: number;
  @ApiProperty() openReports: number;
  @ApiProperty() openAppeals: number;
  @ApiProperty() openSupportTickets: number;
  @ApiProperty() pendingVerifications: number;
  @ApiProperty() sanctionedUsers: number;
  @ApiProperty({ description: 'Pagos aprobados sin aplicar (ADR 0026)' })
  paymentsToReview: number;
}

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ description: 'Nombre, apellido o email' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  q?: string;

  @ApiPropertyOptional({ enum: [UserRole.CUSTOMER, UserRole.PROFESSIONAL] })
  @IsOptional()
  @IsIn([UserRole.CUSTOMER, UserRole.PROFESSIONAL])
  role?: UserRole;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminUserItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
  @ApiProperty() verificationStatus: string;
  @ApiProperty() createdAt: Date;
}

export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserItemDto] }) data: AdminUserItemDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class AdminSubscriptionSummaryDto {
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true, type: String }) planCode: string | null;
  @ApiProperty({ nullable: true, type: Date }) trialEndsAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) currentPeriodEnd: Date | null;
}

export class AdminPaymentSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() planCode: string;
  @ApiProperty() purpose: string;
  @ApiProperty() amount: string;
  @ApiProperty() status: string;
  @ApiProperty() applied: boolean;
  @ApiProperty() reverted: boolean;
  @ApiProperty() createdAt: Date;
}

export class AdminUserDetailDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() phone: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
  @ApiProperty({ nullable: true, type: String }) statusReason: string | null;
  @ApiProperty() verificationStatus: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true, type: Date }) deletedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) deletionScheduledFor: Date | null;
  @ApiProperty({ type: AdminSubscriptionSummaryDto, nullable: true })
  subscription: AdminSubscriptionSummaryDto | null;
  @ApiProperty({ type: [SanctionDto] }) sanctions: SanctionDto[];
  @ApiProperty({ type: [StrikeDto] }) strikes: StrikeDto[];
  @ApiProperty({ description: 'Suma del peso de los strikes no anulados' })
  activeStrikeWeight: number;
  @ApiProperty() reportsAgainst: number;
  @ApiProperty() validReportsAgainst: number;
  @ApiProperty() reportsMade: number;
  @ApiProperty({ type: [AdminPaymentSummaryDto] }) payments: AdminPaymentSummaryDto[];
}
