import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, EntityManager, IsNull, LessThanOrEqual, Not } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewEvents, type ReviewCreatedEvent } from '../reviews/reviews.service';
import { AccountsService } from '../users/accounts.service';
import { User } from '../users/entities/user.entity';
import { AccountStatus, UserRole } from '../users/user.enums';
import type {
  AddStrikeDto,
  AdminAppealDto,
  AdminAppealsQueryDto,
  AppealDto,
  ApplySanctionDto,
  CreateAppealDto,
  MyModerationDto,
  SanctionDto,
  StrikeDto,
} from './dto/moderation.dto';
import {
  Appeal,
  AppealStatus,
  Report,
  ReportStatus,
  Sanction,
  SanctionType,
  Strike,
} from './entities/moderation.entities';
import { ModerationEvents, type ReportCreatedEvent } from './reports.service';

/** Señales de alerta (ADR 0029): solo avisan al admin, nunca sancionan. */
export const ALERT_OPEN_REPORTS = 3;
export const ALERT_CONSECUTIVE_LOW_RATINGS = 5;
export const ALERT_NEGATIVE_REVIEWS = 5;
const LOW_RATING = 2;

const sanctionView = (s: Sanction, now = new Date()): SanctionDto => ({
  id: s.id,
  type: s.type,
  reason: s.reason,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  active: s.liftedAt === null && (s.endsAt === null || s.endsAt > now),
  liftedAt: s.liftedAt,
});

const strikeView = (s: Strike): StrikeDto => ({
  id: s.id,
  weight: s.weight,
  reason: s.reason,
  voided: s.voidedAt !== null,
  voidReason: s.voidReason,
  createdAt: s.createdAt,
});

const appealView = (a: Appeal): AppealDto => ({
  id: a.id,
  strikeId: a.strikeId,
  sanctionId: a.sanctionId,
  body: a.body,
  status: a.status,
  decisionNote: a.decisionNote,
  createdAt: a.createdAt,
});

/**
 * Strikes, sanciones y apelaciones (P-08, C-09, ADR 0029): todo lo decide el admin a mano. Las
 * suspensiones y los baneos pasan por `AccountsService` (cambian el estado de la cuenta y revocan
 * las sesiones). Las suspensiones y perfiles ocultos con fecha de fin se levantan solos.
 */
@Injectable()
export class SanctionsService {
  private readonly logger = new Logger(SanctionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly accounts: AccountsService,
    private readonly notifications: NotificationsService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  // ---- Strikes ----------------------------------------------------------------------------------

  async addStrike(admin: AuthUser, userId: string, dto: AddStrikeDto): Promise<StrikeDto> {
    const created: Notification[] = [];
    const strike = await this.dataSource.transaction(async (manager) => {
      await this.target(manager, userId);
      if (dto.reportId) await this.assertReport(manager, dto.reportId, userId);
      const repository = manager.getRepository(Strike);
      const row = repository.create({
        userId,
        weight: dto.weight,
        reason: dto.reason,
        reportId: dto.reportId ?? null,
        appliedBy: admin.id,
      });
      await repository.insert(row);
      await this.record(manager, admin.id, 'STRIKE_ADDED', userId, dto.reason, {
        strikeId: row.id,
        weight: String(dto.weight),
      });
      created.push(
        await this.notify(
          manager,
          userId,
          'Recibiste un strike',
          dto.reason,
          NotificationTarget.STRIKE,
          row.id,
        ),
      );
      return repository.findOneByOrFail({ id: row.id });
    });
    this.notifications.deliver(created);
    return strikeView(strike);
  }

  async voidStrike(admin: AuthUser, strikeId: string, reason: string): Promise<StrikeDto> {
    const strike = await this.dataSource.transaction((manager) =>
      this.voidStrikeIn(manager, admin.id, strikeId, reason),
    );
    return strikeView(strike);
  }

  // ---- Sanciones --------------------------------------------------------------------------------

  async apply(admin: AuthUser, userId: string, dto: ApplySanctionDto): Promise<SanctionDto> {
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt <= new Date()) {
      throw new BadRequestException({
        code: 'INVALID_END_DATE',
        message: 'La fecha de fin tiene que ser en el futuro.',
      });
    }
    if (
      endsAt &&
      dto.type !== SanctionType.SUSPENSION &&
      dto.type !== SanctionType.PROFILE_HIDDEN
    ) {
      throw new BadRequestException({
        code: 'END_DATE_NOT_ALLOWED',
        message: 'Solo la suspensión y el perfil oculto tienen fecha de fin.',
      });
    }
    if (dto.reportId) {
      await this.assertReport(this.dataSource.manager, dto.reportId, userId);
    }
    const options = { endsAt, reportId: dto.reportId ?? null };
    if (dto.type === SanctionType.SUSPENSION) {
      await this.accounts.suspend(admin, userId, dto.reason, options);
    } else if (dto.type === SanctionType.BAN) {
      await this.accounts.ban(admin, userId, dto.reason, options);
    } else {
      const created: Notification[] = [];
      await this.dataSource.transaction(async (manager) => {
        const user = await this.target(manager, userId);
        if (dto.type === SanctionType.PROFILE_HIDDEN && user.role !== UserRole.PROFESSIONAL) {
          throw new BadRequestException({
            code: 'NOT_A_PROFESSIONAL',
            message: 'Solo se puede ocultar el perfil de un profesional.',
          });
        }
        const repository = manager.getRepository(Sanction);
        const row = repository.create({
          userId,
          type: dto.type,
          reason: dto.reason,
          endsAt,
          reportId: dto.reportId ?? null,
          appliedBy: admin.id,
        });
        await repository.insert(row);
        await this.record(manager, admin.id, 'SANCTION_APPLIED', userId, dto.reason, {
          sanctionId: row.id,
          type: dto.type,
        });
        created.push(
          await this.notify(
            manager,
            userId,
            dto.type === SanctionType.WARNING
              ? 'Recibiste una advertencia'
              : 'Tu perfil está oculto',
            dto.reason,
            NotificationTarget.SANCTION,
            row.id,
          ),
        );
      });
      this.notifications.deliver(created);
    }
    const latest = await this.dataSource.getRepository(Sanction).findOneOrFail({
      where: { userId, type: dto.type },
      order: { createdAt: 'DESC' },
    });
    return sanctionView(latest);
  }

  /** Levanta una sanción. Suspensión y baneo: la cuenta vuelve a su estado (restore). */
  async lift(admin: AuthUser, sanctionId: string, reason: string): Promise<SanctionDto> {
    const sanction = await this.dataSource.getRepository(Sanction).findOneBy({ id: sanctionId });
    if (!sanction) throw new NotFoundException();
    if (sanction.liftedAt) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'La sanción ya está levantada.',
      });
    }
    const user = await this.dataSource.getRepository(User).findOneByOrFail({ id: sanction.userId });
    const accountSanction =
      sanction.type === SanctionType.SUSPENSION || sanction.type === SanctionType.BAN;
    if (
      accountSanction &&
      (user.status === AccountStatus.SUSPENDED || user.status === AccountStatus.BANNED)
    ) {
      // restore() cierra las suspensiones y baneos vigentes y audita ACCOUNT_RESTORED.
      await this.accounts.restore(admin, user.id, reason);
    } else {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(Sanction)
          .update(sanction.id, { liftedAt: new Date(), liftedBy: admin.id, liftReason: reason });
        await this.record(manager, admin.id, 'SANCTION_LIFTED', user.id, reason, {
          sanctionId: sanction.id,
          type: sanction.type,
        });
      });
    }
    return sanctionView(
      await this.dataSource.getRepository(Sanction).findOneByOrFail({ id: sanctionId }),
    );
  }

  /**
   * Suspensiones y perfiles ocultos cuya fecha de fin llegó (tarea horaria). Se levantan solos y
   * queda auditado (ADR 0029). Devuelve cuántos levantó.
   */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.dataSource.getRepository(Sanction).find({
      where: { liftedAt: IsNull(), endsAt: LessThanOrEqual(now) },
      order: { endsAt: 'ASC' },
    });
    let lifted = 0;
    for (const sanction of due) {
      try {
        if (sanction.type === SanctionType.SUSPENSION) {
          if (await this.accounts.endSuspension(sanction.id, now)) lifted++;
          continue;
        }
        await this.dataSource.transaction(async (manager) => {
          const result = await manager
            .getRepository(Sanction)
            .update(
              { id: sanction.id, liftedAt: IsNull() },
              { liftedAt: now, liftReason: 'Terminó el plazo' },
            );
          if (!result.affected) return;
          await this.audit.record(
            {
              actorId: null,
              action: 'SANCTION_EXPIRED',
              targetType: 'USER',
              targetId: sanction.userId,
              reason: 'Terminó el plazo',
              result: 'SUCCESS',
              metadata: { sanctionId: sanction.id, type: sanction.type },
            },
            manager,
          );
          lifted++;
        });
      } catch (error) {
        this.logger.error(`No se pudo levantar la sanción ${sanction.id}`, error as Error);
      }
    }
    return lifted;
  }

  // ---- Lo que ve el usuario y apelaciones -------------------------------------------------------

  async mine(user: AuthUser): Promise<MyModerationDto> {
    const [sanctions, strikes, appeals] = [
      await this.dataSource
        .getRepository(Sanction)
        .find({ where: { userId: user.id }, order: { createdAt: 'DESC' } }),
      await this.dataSource
        .getRepository(Strike)
        .find({ where: { userId: user.id }, order: { createdAt: 'DESC' } }),
      await this.dataSource
        .getRepository(Appeal)
        .find({ where: { userId: user.id }, order: { createdAt: 'DESC' } }),
    ];
    return {
      sanctions: sanctions.map((s) => sanctionView(s)),
      strikes: strikes.map(strikeView),
      appeals: appeals.map(appealView),
    };
  }

  /** Apelación de un strike vigente o de una sanción vigente (una abierta por cada uno). */
  async appeal(user: AuthUser, dto: CreateAppealDto): Promise<AppealDto> {
    if (Boolean(dto.strikeId) === Boolean(dto.sanctionId)) {
      throw new BadRequestException({
        code: 'INVALID_APPEAL_TARGET',
        message: 'Apelá un strike o una sanción.',
      });
    }
    const created: Notification[] = [];
    const appeal = await this.dataSource.transaction(async (manager) => {
      const target = dto.strikeId
        ? await manager.getRepository(Strike).findOneBy({
            id: dto.strikeId,
            userId: user.id,
            voidedAt: IsNull(),
          })
        : await manager.getRepository(Sanction).findOneBy({
            id: dto.sanctionId,
            userId: user.id,
            liftedAt: IsNull(),
          });
      if (!target) {
        throw new NotFoundException({
          code: 'APPEAL_TARGET_NOT_FOUND',
          message: 'No hay un strike o una sanción vigente para apelar.',
        });
      }
      const open = await manager.getRepository(Appeal).existsBy({
        ...(dto.strikeId ? { strikeId: dto.strikeId } : { sanctionId: dto.sanctionId }),
        status: AppealStatus.OPEN,
      });
      if (open) {
        throw new ConflictException({
          code: 'APPEAL_ALREADY_OPEN',
          message: 'Ya hay una apelación en revisión.',
        });
      }
      const repository = manager.getRepository(Appeal);
      const row = repository.create({
        userId: user.id,
        strikeId: dto.strikeId ?? null,
        sanctionId: dto.sanctionId ?? null,
        body: dto.body,
      });
      await repository.insert(row);
      created.push(
        ...(await this.notifications.createForAdmins(manager, {
          type: NotificationType.MODERATION_ALERT,
          title: 'Nueva apelación',
          body: 'Un usuario apeló un strike o una sanción.',
          targetType: NotificationTarget.APPEAL,
          targetId: row.id,
        })),
      );
      return repository.findOneByOrFail({ id: row.id });
    });
    this.notifications.deliver(created);
    return appealView(appeal);
  }

  async adminAppeals(query: AdminAppealsQueryDto) {
    const [rows, total] = await this.dataSource.getRepository(Appeal).findAndCount({
      where: query.status ? { status: query.status } : {},
      relations: { user: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const data: AdminAppealDto[] = rows.map((a) => ({
      ...appealView(a),
      user: {
        id: a.user!.id,
        firstName: a.user!.firstName,
        lastName: a.user!.lastName,
        email: a.user!.email,
        role: a.user!.role,
        status: a.user!.status,
      },
    }));
    return { data, page: query.page, limit: query.limit, total };
  }

  /** Aceptar anula el strike o levanta la sanción; rechazar la deja como está. Auditado. */
  async decide(
    admin: AuthUser,
    appealId: string,
    decision: AppealStatus.ACCEPTED | AppealStatus.REJECTED,
    note: string,
  ): Promise<AppealDto> {
    const appeal = await this.dataSource.getRepository(Appeal).findOneBy({ id: appealId });
    if (!appeal) throw new NotFoundException();
    if (appeal.status !== AppealStatus.OPEN) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'La apelación ya está decidida.',
      });
    }
    const accepted = decision === AppealStatus.ACCEPTED;
    if (accepted && appeal.sanctionId) {
      const sanction = await this.dataSource
        .getRepository(Sanction)
        .findOneByOrFail({ id: appeal.sanctionId });
      if (!sanction.liftedAt) await this.lift(admin, sanction.id, `Apelación aceptada: ${note}`);
    }
    const created: Notification[] = [];
    await this.dataSource.transaction(async (manager) => {
      const updated = await manager
        .getRepository(Appeal)
        .update(
          { id: appealId, status: AppealStatus.OPEN },
          { status: decision, decidedBy: admin.id, decidedAt: new Date(), decisionNote: note },
        );
      if (!updated.affected) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'La apelación ya está decidida.',
        });
      }
      if (accepted && appeal.strikeId) {
        const strike = await manager.getRepository(Strike).findOneByOrFail({ id: appeal.strikeId });
        if (!strike.voidedAt) {
          await this.voidStrikeIn(manager, admin.id, strike.id, `Apelación aceptada: ${note}`);
        }
      }
      await this.record(manager, admin.id, 'APPEAL_DECIDED', appeal.userId, note, {
        appealId,
        decision,
      });
      created.push(
        await this.notifications.create(manager, {
          userId: appeal.userId,
          type: NotificationType.APPEAL_DECIDED,
          title: accepted ? 'Aceptamos tu apelación' : 'Rechazamos tu apelación',
          body: note.slice(0, 300),
          targetType: NotificationTarget.APPEAL,
          targetId: appealId,
        }),
      );
    });
    this.notifications.deliver(created);
    return appealView(
      await this.dataSource.getRepository(Appeal).findOneByOrFail({ id: appealId }),
    );
  }

  // ---- Señales de alerta (solo avisan) ----------------------------------------------------------

  @OnEvent(ModerationEvents.REPORT_CREATED, { promisify: true })
  async onReportCreated(event: ReportCreatedEvent): Promise<void> {
    // Abiertos o válidos: todo menos los rechazados.
    const open = await this.dataSource.getRepository(Report).countBy({
      reportedUserId: event.reportedUserId,
      status: Not(ReportStatus.REJECTED),
    });
    if (open >= ALERT_OPEN_REPORTS) {
      await this.alert(event.reportedUserId, `Tiene ${open} reportes abiertos o válidos.`);
    }
  }

  @OnEvent(ReviewEvents.CREATED, { promisify: true })
  async onReviewCreated(event: ReviewCreatedEvent): Promise<void> {
    const ratings: Array<{ rating: number }> = await this.dataSource.query(
      `SELECT rating FROM reviews
        WHERE professional_id = $1 AND deleted_at IS NULL AND status = 'VISIBLE'
        ORDER BY created_at DESC LIMIT $2`,
      [event.professionalId, ALERT_CONSECUTIVE_LOW_RATINGS],
    );
    if (
      ratings.length === ALERT_CONSECUTIVE_LOW_RATINGS &&
      ratings.every((r) => r.rating <= LOW_RATING)
    ) {
      await this.alert(
        event.professionalId,
        `Recibió ${ALERT_CONSECUTIVE_LOW_RATINGS} calificaciones seguidas de 1 o 2 estrellas.`,
      );
      return;
    }
    const [{ count }]: Array<{ count: string }> = await this.dataSource.query(
      `SELECT count(*) AS count FROM reviews
        WHERE professional_id = $1 AND deleted_at IS NULL AND status = 'VISIBLE' AND rating <= $2`,
      [event.professionalId, LOW_RATING],
    );
    if (Number(count) >= ALERT_NEGATIVE_REVIEWS) {
      await this.alert(event.professionalId, `Tiene ${count} reseñas negativas.`);
    }
  }

  /** Aviso al admin, sin repetirlo mientras no lea el anterior sobre esa persona. */
  private async alert(userId: string, body: string): Promise<void> {
    try {
      const created = await this.dataSource.transaction((manager) =>
        this.notifications.createForAdmins(
          manager,
          {
            type: NotificationType.MODERATION_ALERT,
            title: 'Señal de alerta',
            body: `${body} Revisalo: el sistema no sanciona solo.`,
            targetType: NotificationTarget.USER,
            targetId: userId,
          },
          true,
        ),
      );
      this.notifications.deliver(created);
    } catch (error) {
      this.logger.error('No se pudo avisar la señal de alerta', error as Error);
    }
  }

  // ---------------------------------------------------------------------------------------------

  private async voidStrikeIn(
    manager: EntityManager,
    adminId: string,
    strikeId: string,
    reason: string,
  ): Promise<Strike> {
    const strike = await manager
      .getRepository(Strike)
      .findOne({ where: { id: strikeId }, lock: { mode: 'pessimistic_write' } });
    if (!strike) throw new NotFoundException();
    if (strike.voidedAt) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'El strike ya está anulado.',
      });
    }
    await manager
      .getRepository(Strike)
      .update(strike.id, { voidedAt: new Date(), voidedBy: adminId, voidReason: reason });
    await this.record(manager, adminId, 'STRIKE_VOIDED', strike.userId, reason, {
      strikeId: strike.id,
    });
    return manager.getRepository(Strike).findOneByOrFail({ id: strike.id });
  }

  /** Cliente o profesional existente (no se sanciona a un admin ni a una cuenta anonimizada). */
  private async target(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException();
    if (user.role === UserRole.ADMIN) {
      throw new ConflictException({
        code: 'CANNOT_MODIFY_ADMIN',
        message: 'Esta acción no se puede aplicar a una cuenta de administrador.',
      });
    }
    return user;
  }

  private async assertReport(manager: EntityManager, reportId: string, userId: string) {
    const ok = await manager
      .getRepository(Report)
      .existsBy({ id: reportId, reportedUserId: userId });
    if (!ok) {
      throw new BadRequestException({
        code: 'INVALID_REPORT',
        message: 'El reporte no existe o no es sobre esa persona.',
      });
    }
  }

  private notify(
    manager: EntityManager,
    userId: string,
    title: string,
    body: string,
    targetType: NotificationTarget,
    targetId: string,
  ) {
    return this.notifications.create(manager, {
      userId,
      type: NotificationType.MODERATION_ACTION,
      title,
      body: body.slice(0, 300),
      targetType,
      targetId,
    });
  }

  private record(
    manager: EntityManager,
    actorId: string,
    action: string,
    userId: string,
    reason: string | null,
    metadata: Record<string, string> = {},
  ) {
    return this.audit.record(
      {
        actorId,
        action,
        targetType: 'USER',
        targetId: userId,
        reason,
        result: 'SUCCESS',
        metadata,
      },
      manager,
    );
  }
}
