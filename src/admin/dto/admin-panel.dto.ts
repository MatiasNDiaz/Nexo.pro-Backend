import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { SanctionDto, StrikeDto } from '../../moderation/dto/moderation.dto';
import { PublicationRequirement } from '../../catalog/visibility';
import { AccountStatus, UserRole, VerificationStatus } from '../../users/user.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const JOINED = ['today', '7d', '30d'] as const;
export type Joined = (typeof JOINED)[number];
export const FLAGS = ['sanctioned', 'strikes', 'reported', 'open_reports'] as const;
export type Flag = (typeof FLAGS)[number];
export const PLANS = ['TRIAL', 'BASIC', 'MEDIUM', 'PREMIUM', 'NONE'] as const;
export type PlanFilter = (typeof PLANS)[number];
export const PAGE_STATES = ['published', 'unpublished'] as const;
export type PageState = (typeof PAGE_STATES)[number];
export const LOGINS = ['google', 'password'] as const;
export type LoginFilter = (typeof LOGINS)[number];
export const SORTS = ['recent', 'oldest', 'name', 'last_login'] as const;
export type Sort = (typeof SORTS)[number];

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

  @ApiPropertyOptional({ enum: VerificationStatus, description: 'Verificación de identidad' })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verification?: VerificationStatus;

  @ApiPropertyOptional({ enum: JOINED, description: 'Recién agregados: hoy, últimos 7 o 30 días' })
  @IsOptional()
  @IsIn(JOINED)
  joined?: Joined;

  @ApiPropertyOptional({
    enum: FLAGS,
    isArray: true,
    description:
      'Moderación, separadas por coma (tienen que cumplirse todas): sanción vigente, strikes sin anular, algún reporte en contra, reportes sin resolver',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsIn(FLAGS, { each: true })
  flags?: Flag[];

  @ApiPropertyOptional({
    enum: PLANS,
    description: 'Profesionales: en prueba, con un plan pago vigente o sin ninguno (NONE)',
  })
  @IsOptional()
  @IsIn(PLANS)
  plan?: PlanFilter;

  @ApiPropertyOptional({ enum: PAGE_STATES, description: 'Profesionales: página pública o no' })
  @IsOptional()
  @IsIn(PAGE_STATES)
  pageState?: PageState;

  @ApiPropertyOptional({
    enum: LOGINS,
    description: 'Cómo ingresa: con Google o solo con contraseña',
  })
  @IsOptional()
  @IsIn(LOGINS)
  login?: LoginFilter;

  @ApiPropertyOptional({
    enum: SORTS,
    default: 'recent',
    description: 'Por defecto, los más nuevos primero',
  })
  @IsOptional()
  @IsIn(SORTS)
  sort: Sort = 'recent';

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

/** Página pública del profesional, para el admin. */
export class AdminProfessionalSummaryDto {
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true, type: String }) businessName: string | null;
  @ApiProperty({ description: 'true si cualquiera la ve en el catálogo' }) published: boolean;
  @ApiProperty({ type: [String], description: 'Oficios activos (el principal primero)' })
  professions: string[];
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Plan vigente (en prueba es el de la prueba); null sin prueba ni plan vigente',
  })
  planCode: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'TRIAL o ACTIVE; null si no tiene vigente',
  })
  subscriptionStatus: string | null;
}

export class AdminUserItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
  @ApiProperty() verificationStatus: string;
  @ApiProperty({ description: 'Tiene Google vinculado' }) google: boolean;
  @ApiProperty({ description: 'Tiene contraseña (si no, solo entra con Google)' })
  hasPassword: boolean;
  @ApiProperty({ nullable: true, type: Date }) emailVerifiedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) lastLoginAt: Date | null;
  @ApiProperty({ nullable: true, type: String, description: 'Localidad (y barrio) del perfil' })
  location: string | null;
  @ApiProperty({ type: AdminProfessionalSummaryDto, nullable: true })
  professional: AdminProfessionalSummaryDto | null;
  @ApiProperty({ description: 'Sanciones vigentes' }) activeSanctions: number;
  @ApiProperty({ description: 'Suma del peso de los strikes no anulados' })
  activeStrikeWeight: number;
  @ApiProperty() reportsAgainst: number;
  @ApiProperty({ description: 'Reportes en contra sin resolver' }) openReportsAgainst: number;
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
  @ApiProperty({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Foto nueva esperando revisión' })
  pendingAvatarUrl: string | null;
  @ApiProperty({ description: 'Tiene Google vinculado' }) google: boolean;
  @ApiProperty() hasPassword: boolean;
  @ApiProperty({ nullable: true, type: Date }) emailVerifiedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) lastLoginAt: Date | null;
  @ApiProperty({ nullable: true, type: String }) location: string | null;
  @ApiProperty({ type: AdminProfessionalSummaryDto, nullable: true })
  professional: AdminProfessionalSummaryDto | null;
  @ApiProperty({
    enum: PublicationRequirement,
    isArray: true,
    nullable: true,
    description: 'Profesionales: lo que le falta a su página para ser pública (vacío = publicada)',
  })
  publicationMissing: PublicationRequirement[] | null;
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
