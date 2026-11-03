import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import { Conversation, Message } from '../chat/entities/chat.entities';
import type { AuthUser } from '../common/decorators';
import { ForumPost, ForumReply } from '../forum/entities/forum.entities';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Review } from '../reviews/entities/review.entity';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FilePurpose } from '../uploads/file.enums';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/user.enums';
import type {
  AdminReportDto,
  AdminReportListDto,
  AdminReportsQueryDto,
  CreateReportDto,
  MyReportDto,
  ReportConversationDto,
  UserRefDto,
} from './dto/moderation.dto';
import {
  OPEN_REPORT_STATUSES,
  Report,
  ReportEvidence,
  ReportStatus,
  ReportTarget,
} from './entities/moderation.entities';

export const ModerationEvents = {
  /** Reporte nuevo (después del commit): se revisan las señales de alerta. */
  REPORT_CREATED: 'moderation.report-created',
} as const;

export interface ReportCreatedEvent {
  reportedUserId: string;
}

const targetNotFound = () =>
  new NotFoundException({
    code: 'REPORT_TARGET_NOT_FOUND',
    message: 'Lo que querés reportar no existe o no lo podés reportar.',
  });

const reportNotFound = () =>
  new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'El reporte no existe.' });

const userRef = (user: User): UserRefDto => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  status: user.status,
});

/**
 * Reportes (FI §20.1, ADR 0029). La identidad del denunciante nunca sale hacia el denunciado, que
 * solo se entera cuando el admin marca el reporte como válido. El admin ve el chat únicamente desde
 * un reporte de mensaje, y cada acceso queda auditado (C-32).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async create(user: AuthUser, dto: CreateReportDto): Promise<MyReportDto> {
    const report = await this.dataSource.transaction(async (manager) => {
      const reportedUserId = await this.reportedUserOf(manager, user.id, dto);
      const open = await manager.getRepository(Report).existsBy({
        reporterId: user.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: In([...OPEN_REPORT_STATUSES]),
      });
      if (open) {
        throw new ConflictException({
          code: 'REPORT_ALREADY_OPEN',
          message: 'Ya reportaste esto y lo estamos revisando.',
        });
      }
      const files: StoredFile[] = [];
      for (const fileId of dto.evidenceFileIds ?? []) {
        files.push(
          await this.uploads.lockReadyFile(manager, user.id, fileId, FilePurpose.EVIDENCE),
        );
      }
      const repository = manager.getRepository(Report);
      const row = repository.create({
        reporterId: user.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reportedUserId,
        reason: dto.reason,
        description: dto.description,
      });
      await repository.insert(row);
      if (files.length) {
        await manager
          .getRepository(ReportEvidence)
          .insert(files.map((file, position) => ({ reportId: row.id, fileId: file.id, position })));
      }
      return row;
    });
    const event: ReportCreatedEvent = { reportedUserId: report.reportedUserId };
    await this.events.emitAsync(ModerationEvents.REPORT_CREATED, event);
    return this.mine(user).then((list) => list.find((r) => r.id === report.id)!);
  }

  async mine(user: AuthUser): Promise<MyReportDto[]> {
    const rows = await this.dataSource.getRepository(Report).find({
      where: { reporterId: user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map(({ id, targetType, targetId, reason, status, createdAt }) => ({
      id,
      targetType,
      targetId,
      reason,
      status,
      createdAt,
    }));
  }

  async adminList(query: AdminReportsQueryDto): Promise<AdminReportListDto> {
    const [rows, total] = await this.dataSource.getRepository(Report).findAndCount({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.targetType && { targetType: query.targetType }),
        ...(query.reportedUserId && { reportedUserId: query.reportedUserId }),
      },
      relations: { reporter: true, reportedUser: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const data: AdminReportDto[] = [];
    for (const row of rows) data.push(await this.adminView(row));
    return { data, page: query.page, limit: query.limit, total };
  }

  async adminGet(id: string): Promise<AdminReportDto> {
    const row = await this.dataSource.getRepository(Report).findOne({
      where: { id },
      relations: { reporter: true, reportedUser: true },
      withDeleted: true,
    });
    if (!row) throw reportNotFound();
    return this.adminView(row);
  }

  /** Enviado → en revisión (el denunciante lo ve en su lista). */
  async startReview(admin: AuthUser, id: string): Promise<AdminReportDto> {
    await this.dataSource.transaction(async (manager) => {
      const report = await this.lock(manager, id);
      if (report.status !== ReportStatus.SUBMITTED) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'El reporte ya está en revisión o resuelto.',
        });
      }
      await manager.getRepository(Report).update(id, { status: ReportStatus.UNDER_REVIEW });
      await this.record(manager, admin.id, 'REPORT_UNDER_REVIEW', id, null);
    });
    return this.adminGet(id);
  }

  /**
   * Válido o rechazado (ADR 0029). Al denunciante se le avisa que se revisó; al denunciado, solo si
   * es válido y sin decir quién lo reportó. Un rechazo no tiene consecuencias para nadie.
   */
  async resolve(admin: AuthUser, id: string, valid: boolean, note: string) {
    const created: Notification[] = [];
    await this.dataSource.transaction(async (manager) => {
      const report = await this.lock(manager, id);
      if (!OPEN_REPORT_STATUSES.includes(report.status as (typeof OPEN_REPORT_STATUSES)[number])) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'El reporte ya está resuelto.',
        });
      }
      const status = valid ? ReportStatus.VALID : ReportStatus.REJECTED;
      await manager.getRepository(Report).update(id, {
        status,
        resolvedBy: admin.id,
        resolvedAt: new Date(),
        resolutionNote: note,
      });
      await this.record(manager, admin.id, 'REPORT_RESOLVED', id, note, { status });
      created.push(
        await this.notifications.create(manager, {
          userId: report.reporterId,
          type: NotificationType.REPORT_RESOLVED,
          title: 'Revisamos tu reporte',
          body: 'Gracias por avisarnos. Ya revisamos lo que reportaste.',
          targetType: NotificationTarget.REPORT,
          targetId: report.id,
        }),
      );
      if (valid) {
        created.push(
          await this.notifications.create(manager, {
            userId: report.reportedUserId,
            type: NotificationType.REPORT_UPHELD,
            title: 'Recibiste un reporte válido',
            body: 'Revisamos un reporte sobre tu actividad y lo consideramos válido. Revisá las normas de la comunidad.',
            targetType: null,
            targetId: null,
          }),
        );
      }
    });
    this.notifications.deliver(created);
    return this.adminGet(id);
  }

  /** C-32: el chat del mensaje reportado, con las versiones originales. Cada acceso se audita. */
  async conversation(admin: AuthUser, id: string): Promise<ReportConversationDto> {
    const report = await this.dataSource.getRepository(Report).findOneBy({ id });
    if (!report) throw reportNotFound();
    if (report.targetType !== ReportTarget.MESSAGE) {
      throw new BadRequestException({
        code: 'NOT_A_MESSAGE_REPORT',
        message: 'Solo se puede ver el chat desde un reporte de mensaje.',
      });
    }
    const reported = await this.dataSource
      .getRepository(Message)
      .findOneBy({ id: report.targetId });
    if (!reported) throw targetNotFound();
    const messages = await this.dataSource.getRepository(Message).find({
      where: { conversationId: reported.conversationId },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    await this.record(this.dataSource.manager, admin.id, 'ADMIN_CHAT_ACCESSED', id, null, {
      conversationId: reported.conversationId,
    });
    return {
      conversationId: reported.conversationId,
      messages: messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        senderId: m.senderId,
        body: m.body,
        originalBody: m.originalBody,
        edited: m.editedAt !== null,
        deleted: m.deletedAt !== null,
        reported: m.id === reported.id,
        createdAt: m.createdAt,
      })),
    };
  }

  // ---------------------------------------------------------------------------------------------

  /** Valida que el contenido exista y se pueda reportar; devuelve a quién se reporta. */
  private async reportedUserOf(
    manager: EntityManager,
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<string> {
    let reported: string | null = null;
    switch (dto.targetType) {
      case ReportTarget.PROFILE: {
        const user = await manager.getRepository(User).findOneBy({ id: dto.targetId });
        if (user && user.role !== UserRole.ADMIN) reported = user.id;
        break;
      }
      case ReportTarget.MESSAGE: {
        const message = await manager.getRepository(Message).findOneBy({ id: dto.targetId });
        const conversation = message
          ? await manager.getRepository(Conversation).findOneBy({ id: message.conversationId })
          : null;
        // Solo un participante reporta un mensaje del otro (no los automáticos).
        const participant =
          conversation?.customerId === reporterId || conversation?.professionalId === reporterId;
        if (participant && message?.senderId) reported = message.senderId;
        break;
      }
      case ReportTarget.FORUM_POST: {
        const post = await manager.getRepository(ForumPost).findOneBy({ id: dto.targetId });
        if (post && !post.deletedAt) reported = post.authorId;
        break;
      }
      case ReportTarget.FORUM_REPLY: {
        const reply = await manager.getRepository(ForumReply).findOneBy({ id: dto.targetId });
        if (reply && !reply.deletedAt) reported = reply.authorId;
        break;
      }
      case ReportTarget.REVIEW: {
        const review = await manager.getRepository(Review).findOneBy({ id: dto.targetId });
        if (review && !review.deletedAt) reported = review.customerId;
        break;
      }
    }
    if (!reported || reported === reporterId) throw targetNotFound();
    return reported;
  }

  /** El contenido reportado, para que el admin decida (sin el chat completo). */
  private async targetSnapshot(report: Report): Promise<Record<string, unknown> | null> {
    const manager = this.dataSource.manager;
    switch (report.targetType) {
      case ReportTarget.PROFILE:
        return { userId: report.targetId };
      case ReportTarget.MESSAGE: {
        const m = await manager.getRepository(Message).findOneBy({ id: report.targetId });
        return m
          ? {
              body: m.body,
              originalBody: m.originalBody,
              deleted: m.deletedAt !== null,
              createdAt: m.createdAt,
            }
          : null;
      }
      case ReportTarget.FORUM_POST: {
        const p = await manager.getRepository(ForumPost).findOneBy({ id: report.targetId });
        return p ? { body: p.body, status: p.status, deleted: p.deletedAt !== null } : null;
      }
      case ReportTarget.FORUM_REPLY: {
        const r = await manager.getRepository(ForumReply).findOneBy({ id: report.targetId });
        return r
          ? { body: r.body, postId: r.postId, status: r.status, deleted: r.deletedAt !== null }
          : null;
      }
      case ReportTarget.REVIEW: {
        const r = await manager.getRepository(Review).findOneBy({ id: report.targetId });
        return r
          ? {
              rating: r.rating,
              comment: r.comment,
              professionalId: r.professionalId,
              status: r.status,
              deleted: r.deletedAt !== null,
            }
          : null;
      }
    }
  }

  private async adminView(row: Report): Promise<AdminReportDto> {
    const evidence = await this.dataSource
      .getRepository(ReportEvidence)
      .find({ where: { reportId: row.id }, order: { position: 'ASC' } });
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
      description: row.description,
      reporter: userRef(row.reporter!),
      reportedUser: userRef(row.reportedUser!),
      evidenceFileIds: evidence.map((e) => e.fileId),
      target: await this.targetSnapshot(row),
      resolvedAt: row.resolvedAt,
      resolutionNote: row.resolutionNote,
    };
  }

  private async lock(manager: EntityManager, id: string): Promise<Report> {
    const report = await manager
      .getRepository(Report)
      .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!report) throw reportNotFound();
    return report;
  }

  private record(
    manager: EntityManager,
    actorId: string,
    action: string,
    reportId: string,
    reason: string | null,
    metadata: Record<string, string> = {},
  ) {
    return this.audit.record(
      {
        actorId,
        action,
        targetType: 'REPORT',
        targetId: reportId,
        reason,
        result: 'SUCCESS',
        metadata,
      },
      manager,
    );
  }
}
