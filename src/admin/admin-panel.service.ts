import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Sanction, Strike } from '../moderation/entities/moderation.entities';
import { Payment } from '../payments/entities/payment.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import type {
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUsersQueryDto,
  DashboardDto,
} from './dto/admin-panel.dto';

type CountRow = { key: string; count: string };
const toMap = (rows: CountRow[]) =>
  Object.fromEntries(rows.map((r) => [r.key, Number(r.count)])) as Record<string, number>;

/** Panel del admin (FI §19, ADR 0029): cifras generales, búsqueda y ficha de cada persona. */
@Injectable()
export class AdminPanelService {
  constructor(private readonly dataSource: DataSource) {}

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

  /** Búsqueda por nombre o email, rol y estado (las cuentas anonimizadas no aparecen). */
  async search(query: AdminUsersQueryDto): Promise<AdminUserListDto> {
    const builder = this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .where("u.role <> 'ADMIN'");
    if (query.q) {
      builder.andWhere(`(u.email ILIKE :q OR (u.first_name || ' ' || u.last_name) ILIKE :q)`, {
        q: `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      });
    }
    if (query.role) builder.andWhere('u.role = :role', { role: query.role });
    if (query.status) builder.andWhere('u.status = :status', { status: query.status });
    const [rows, total] = await builder
      .orderBy('u.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      data: rows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        status: u.status,
        verificationStatus: u.verificationStatus,
        createdAt: u.createdAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
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
    const now = new Date();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
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
