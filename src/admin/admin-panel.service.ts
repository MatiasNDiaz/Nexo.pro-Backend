import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { PUBLISHED_EXISTS, publicationChecklist } from '../catalog/visibility';
import { Sanction, Strike } from '../moderation/entities/moderation.entities';
import { Payment } from '../payments/entities/payment.entity';
import { ATTENTION_TIME_ZONE } from '../professionals/attention-status';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import type { AccountStatus, UserRole } from '../users/user.enums';
import type {
  AdminProfessionalSummaryDto,
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUsersQueryDto,
  DashboardDto,
  Flag,
  Sort,
} from './dto/admin-panel.dto';

type CountRow = { key: string; count: string };
const toMap = (rows: CountRow[]) =>
  Object.fromEntries(rows.map((r) => [r.key, Number(r.count)])) as Record<string, number>;

/** Comienzo del día de hoy en Córdoba. */
const TODAY_START = `(date_trunc('day', now() AT TIME ZONE '${ATTENTION_TIME_ZONE}') AT TIME ZONE '${ATTENTION_TIME_ZONE}')`;

/**
 * Datos calculados de cada cuenta (alias `u` de users y `p` de su perfil profesional, si tiene):
 * Google vinculado, página publicada (misma regla que el catálogo), suscripción vigente, oficios y
 * cifras de moderación.
 */
const USER_LATERALS = `
  CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM auth_identities x
                                      WHERE x.user_id = u.id AND x.provider = 'GOOGLE') AS google) ai
  CROSS JOIN LATERAL (SELECT (p.id IS NOT NULL AND ${PUBLISHED_EXISTS}) AS published) pub
  LEFT JOIN LATERAL (
    SELECT sp.code, s.status::text AS status
      FROM subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id
     WHERE s.user_id = u.id AND s.status IN ('TRIAL', 'ACTIVE')
       AND (s.status <> 'TRIAL' OR s.trial_ends_at > now())
       AND (s.status <> 'ACTIVE' OR s.current_period_end > now())
     ORDER BY s.created_at DESC LIMIT 1) live ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(pr.name ORDER BY pp.is_primary DESC, pp.created_at ASC) AS names
      FROM professional_professions pp JOIN professions pr ON pr.id = pp.profession_id
     WHERE pp.professional_id = p.id AND pp.status = 'ACTIVE') prof ON true
  CROSS JOIN LATERAL (
    SELECT (SELECT count(*) FROM sanctions sa
             WHERE sa.user_id = u.id AND sa.lifted_at IS NULL
               AND (sa.ends_at IS NULL OR sa.ends_at > now())) AS active_sanctions,
           (SELECT coalesce(sum(st.weight), 0) FROM strikes st
             WHERE st.user_id = u.id AND st.voided_at IS NULL) AS strike_weight,
           (SELECT count(*) FROM reports r WHERE r.reported_user_id = u.id) AS reports_against,
           (SELECT count(*) FROM reports r
             WHERE r.reported_user_id = u.id AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')) AS open_reports
  ) m`;

const USER_COLUMNS = `u.id, u.email, u.first_name, u.last_name, u.avatar_file_id,
  u.pending_avatar_file_id, u.phone, u.role, u.status, u.verification_status, u.email_verified_at,
  u.last_login_at, u.created_at, u.password_hash IS NOT NULL AS has_password, ai.google,
  l.name AS locality_name, n.name AS neighborhood_name, p.slug, p.business_name, pub.published,
  live.code AS plan_code, live.status AS subscription_status, prof.names AS professions,
  m.active_sanctions, m.strike_weight, m.reports_against, m.open_reports`;

const USER_FROM = `FROM users u
  LEFT JOIN professional_profiles p ON p.user_id = u.id
  LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
  LEFT JOIN localities l ON l.id = n.locality_id
  ${USER_LATERALS}`;

const FLAG_SQL: Record<Flag, string> = {
  sanctioned: 'm.active_sanctions > 0',
  strikes: 'm.strike_weight > 0',
  reported: 'm.reports_against > 0',
  open_reports: 'm.open_reports > 0',
};

const SORT_SQL: Record<Sort, string> = {
  recent: 'u.created_at DESC, u.id',
  oldest: 'u.created_at ASC, u.id',
  name: 'lower(u.first_name) ASC, lower(u.last_name) ASC, u.id',
  last_login: 'u.last_login_at DESC NULLS LAST, u.id',
};

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_file_id: string | null;
  pending_avatar_file_id: string | null;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  verification_status: string;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  has_password: boolean;
  google: boolean;
  locality_name: string | null;
  neighborhood_name: string | null;
  slug: string | null;
  business_name: string | null;
  published: boolean;
  plan_code: string | null;
  subscription_status: string | null;
  professions: string[] | null;
  active_sanctions: string;
  strike_weight: string;
  reports_against: string;
  open_reports: string;
  /** Solo en el listado. */
  total?: string;
}

const locationOf = (r: UserRow) =>
  r.locality_name
    ? r.neighborhood_name
      ? `${r.neighborhood_name}, ${r.locality_name}`
      : r.locality_name
    : null;

const professionalOf = (r: UserRow): AdminProfessionalSummaryDto | null =>
  r.slug
    ? {
        slug: r.slug,
        businessName: r.business_name,
        published: r.published,
        professions: r.professions ?? [],
        planCode: r.plan_code,
        subscriptionStatus: r.subscription_status,
      }
    : null;

/** Panel del admin (FI §19, ADR 0029): cifras generales, búsqueda y ficha de cada persona. */
@Injectable()
export class AdminPanelService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  async dashboard(): Promise<DashboardDto> {
    const q = <T>(sql: string) => this.dataSource.query<T>(sql);
    const usersByRole = toMap(
      await q<CountRow[]>(
        `SELECT role::text AS key, count(*) AS count FROM users
          WHERE deleted_at IS NULL AND role <> 'ADMIN' GROUP BY role`,
      ),
    );
    const usersByStatus = toMap(
      await q<CountRow[]>(
        `SELECT status::text AS key, count(*) AS count FROM users
          WHERE deleted_at IS NULL AND role <> 'ADMIN' GROUP BY status`,
      ),
    );
    // La última suscripción de cada profesional.
    const subscriptionsByStatus = toMap(
      await q<CountRow[]>(
        `SELECT status::text AS key, count(*) AS count
           FROM (SELECT DISTINCT ON (user_id) status FROM subscriptions
                  ORDER BY user_id, created_at DESC) last
          GROUP BY status`,
      ),
    );
    const professionalsByPlan = toMap(
      await q<CountRow[]>(
        `SELECT sp.code AS key, count(*) AS count FROM subscriptions s
           JOIN subscription_plans sp ON sp.id = s.plan_id
          WHERE (s.status = 'TRIAL' AND s.trial_ends_at > now())
             OR (s.status = 'ACTIVE' AND s.current_period_end > now())
          GROUP BY sp.code`,
      ),
    );
    const [counts] = await q<Array<Record<string, string>>>(
      `SELECT
         (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role <> 'ADMIN'
            AND created_at > now() - interval '7 days') AS new_users,
         (SELECT count(*) FROM forum_posts WHERE deleted_at IS NULL
            AND created_at > now() - interval '7 days') AS new_posts,
         (SELECT count(*) FROM reports WHERE created_at > now() - interval '7 days') AS new_reports,
         (SELECT count(*) FROM reports WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')) AS open_reports,
         (SELECT count(*) FROM appeals WHERE status = 'OPEN') AS open_appeals,
         (SELECT count(*) FROM support_tickets WHERE status = 'OPEN') AS open_tickets,
         (SELECT count(*) FROM identity_verifications
            WHERE status IN ('PENDING', 'REQUIRES_REVIEW')) AS pending_verifications,
         (SELECT count(DISTINCT user_id) FROM sanctions WHERE lifted_at IS NULL
            AND type <> 'WARNING' AND (ends_at IS NULL OR ends_at > now())) AS sanctioned_users,
         (SELECT count(*) FROM payments WHERE status = 'APPROVED' AND applied_at IS NULL)
            AS payments_to_review`,
    );
    return {
      usersByRole,
      usersByStatus,
      subscriptionsByStatus,
      professionalsByPlan,
      newUsersLast7Days: Number(counts.new_users),
      newForumPostsLast7Days: Number(counts.new_posts),
      newReportsLast7Days: Number(counts.new_reports),
      openReports: Number(counts.open_reports),
      openAppeals: Number(counts.open_appeals),
      openSupportTickets: Number(counts.open_tickets),
      pendingVerifications: Number(counts.pending_verifications),
      sanctionedUsers: Number(counts.sanctioned_users),
      paymentsToReview: Number(counts.payments_to_review),
    };
  }

  /**
   * Todas las cuentas de clientes y profesionales, completas o no (pedido del fundador del
   * 2026-11-11), con foto y lo necesario para decidir sin abrir la ficha. Por defecto las más nuevas
   * primero. Filtros combinables: texto, rol, estado, identidad, recién agregados, moderación, plan,
   * página publicada y forma de ingreso. Las cuentas anonimizadas no aparecen.
   */
  async search(query: AdminUsersQueryDto): Promise<AdminUserListDto> {
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where = [`u.role <> 'ADMIN'`, 'u.deleted_at IS NULL'];
    if (query.q) {
      const q = param(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where.push(
        `(u.email ILIKE ${q} OR (u.first_name || ' ' || u.last_name) ILIKE ${q} OR p.business_name ILIKE ${q})`,
      );
    }
    if (query.role) where.push(`u.role = ${param(query.role)}`);
    if (query.status) where.push(`u.status = ${param(query.status)}`);
    if (query.verification) where.push(`u.verification_status = ${param(query.verification)}`);
    if (query.joined === 'today') where.push(`u.created_at >= ${TODAY_START}`);
    if (query.joined === '7d') where.push(`u.created_at >= now() - interval '7 days'`);
    if (query.joined === '30d') where.push(`u.created_at >= now() - interval '30 days'`);
    for (const flag of new Set(query.flags ?? [])) where.push(FLAG_SQL[flag]);
    if (query.plan === 'TRIAL') where.push(`live.status = 'TRIAL'`);
    else if (query.plan === 'NONE') where.push(`u.role = 'PROFESSIONAL' AND live.code IS NULL`);
    else if (query.plan) where.push(`live.status = 'ACTIVE' AND live.code = ${param(query.plan)}`);
    if (query.pageState === 'published') where.push('pub.published');
    if (query.pageState === 'unpublished')
      where.push(`u.role = 'PROFESSIONAL' AND NOT pub.published`);
    if (query.login === 'google') where.push('ai.google');
    if (query.login === 'password') where.push('NOT ai.google');

    const limit = param(query.limit);
    const offset = param((query.page - 1) * query.limit);
    const rows = await this.dataSource.query<UserRow[]>(
      `SELECT ${USER_COLUMNS}, count(*) OVER () AS total
         ${USER_FROM}
        WHERE ${where.join(' AND ')}
        ORDER BY ${SORT_SQL[query.sort]}
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const avatars = await this.uploads.publicUrls(
      rows.flatMap((r) => (r.avatar_file_id ? [r.avatar_file_id] : [])),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        avatarUrl: r.avatar_file_id ? (avatars.get(r.avatar_file_id) ?? null) : null,
        phone: r.phone,
        role: r.role,
        status: r.status,
        verificationStatus: r.verification_status,
        google: r.google,
        hasPassword: r.has_password,
        emailVerifiedAt: r.email_verified_at,
        lastLoginAt: r.last_login_at,
        location: locationOf(r),
        professional: professionalOf(r),
        activeSanctions: Number(r.active_sanctions),
        activeStrikeWeight: Number(r.strike_weight),
        reportsAgainst: Number(r.reports_against),
        openReportsAgainst: Number(r.open_reports),
        createdAt: r.created_at,
      })),
      page: query.page,
      limit: query.limit,
      total: rows.length ? Number(rows[0].total) : 0,
    };
  }

  /** Ficha completa: datos, suscripción, sanciones, strikes, reportes y pagos (FI §19). */
  async detail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id }, withDeleted: true });
    if (!user) throw new NotFoundException();
    const subscription = await this.dataSource.getRepository(Subscription).findOne({
      where: { userId: id },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
    });
    const sanctions = await this.dataSource
      .getRepository(Sanction)
      .find({ where: { userId: id }, order: { createdAt: 'DESC' } });
    const strikes = await this.dataSource
      .getRepository(Strike)
      .find({ where: { userId: id }, order: { createdAt: 'DESC' } });
    const activeStrikes = await this.dataSource
      .getRepository(Strike)
      .findBy({ userId: id, voidedAt: IsNull() });
    const [reports] = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT
         count(*) FILTER (WHERE reported_user_id = $1) AS against,
         count(*) FILTER (WHERE reported_user_id = $1 AND status = 'VALID') AS valid_against,
         count(*) FILTER (WHERE reporter_id = $1) AS made
       FROM reports WHERE reported_user_id = $1 OR reporter_id = $1`,
      [id],
    );
    const payments = await this.dataSource.getRepository(Payment).find({
      where: { userId: id },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const [row] = await this.dataSource.query<UserRow[]>(
      `SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.id = $1`,
      [id],
    );
    const { avatarUrl, pendingAvatarUrl } = await this.uploads.avatarUrls(user);
    const now = new Date();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl,
      pendingAvatarUrl,
      google: row.google,
      hasPassword: row.has_password,
      emailVerifiedAt: row.email_verified_at,
      lastLoginAt: row.last_login_at,
      location: locationOf(row),
      professional: professionalOf(row),
      publicationMissing: await publicationChecklist(this.dataSource, id),
      role: user.role,
      status: user.status,
      statusReason: user.statusReason,
      verificationStatus: user.verificationStatus,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      deletionScheduledFor: user.deletionScheduledFor,
      subscription: subscription
        ? {
            status: subscription.status,
            planCode: subscription.plan?.code ?? null,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      sanctions: sanctions.map((s) => ({
        id: s.id,
        type: s.type,
        reason: s.reason,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        active: s.liftedAt === null && (s.endsAt === null || s.endsAt > now),
        liftedAt: s.liftedAt,
      })),
      strikes: strikes.map((s) => ({
        id: s.id,
        weight: s.weight,
        reason: s.reason,
        voided: s.voidedAt !== null,
        voidReason: s.voidReason,
        createdAt: s.createdAt,
      })),
      activeStrikeWeight: activeStrikes.reduce((sum, s) => sum + s.weight, 0),
      reportsAgainst: Number(reports.against),
      validReportsAgainst: Number(reports.valid_against),
      reportsMade: Number(reports.made),
      payments: payments.map((p) => ({
        id: p.id,
        planCode: p.plan?.code ?? '',
        purpose: p.purpose,
        amount: p.amount,
        status: p.status,
        applied: p.appliedAt !== null,
        reverted: p.revertedAt !== null,
        createdAt: p.createdAt,
      })),
    };
  }
}
