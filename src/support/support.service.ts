import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import { CaptchaService } from '../integrations/abuse/captcha.service';
import { MAIL_PROVIDER, type MailProvider } from '../integrations/mail/mail-provider';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FilePurpose } from '../uploads/file.enums';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import type {
  AdminTicketDto,
  AdminTicketsQueryDto,
  ContactDto,
  CreateTicketDto,
  TicketDto,
  TicketMessageInputDto,
} from './dto/support.dto';
import { SupportMessage, SupportTicket, TicketStatus } from './entities/support.entities';

const ticketNotFound = () =>
  new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'La consulta no existe.' });

/**
 * Soporte (FI §21, ADR 0029): consultas desde la app (con una foto) o desde el formulario público.
 * El admin responde en la plataforma y por email. Sin número de seguimiento; el plazo que se
 * comunica es de 48 a 72 horas hábiles.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly captcha: CaptchaService,
  ) {}

  async create(user: AuthUser, dto: CreateTicketDto): Promise<TicketDto> {
    const created: Notification[] = [];
    const id = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SupportTicket);
      const ticket = repository.create({ userId: user.id, category: dto.category });
      await repository.insert(ticket);
      await this.addMessage(manager, ticket.id, user.id, false, dto.body, dto.fileId);
      created.push(...(await this.alertAdmins(manager, ticket.id)));
      return ticket.id;
    });
    this.notifications.deliver(created);
    return this.mine(user, id);
  }

  /** Formulario público: guarda la consulta para responderla por email. */
  async contact(dto: ContactDto): Promise<{ received: true }> {
    await this.captcha.assert(dto.captchaToken);
    const created: Notification[] = [];
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SupportTicket);
      const ticket = repository.create({
        userId: null,
        contactEmail: dto.email,
        contactName: dto.name,
        category: dto.category,
      });
      await repository.insert(ticket);
      await this.addMessage(manager, ticket.id, null, false, dto.body);
      created.push(...(await this.alertAdmins(manager, ticket.id)));
    });
    this.notifications.deliver(created);
    return { received: true };
  }

  async list(user: AuthUser): Promise<TicketDto[]> {
    const tickets = await this.dataSource.getRepository(SupportTicket).find({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    return Promise.all(tickets.map((t) => this.view(t)));
  }

  async mine(user: AuthUser, id: string): Promise<TicketDto> {
    const ticket = await this.dataSource
      .getRepository(SupportTicket)
      .findOneBy({ id, userId: user.id });
    if (!ticket) throw ticketNotFound();
    return this.view(ticket);
  }

  /** El usuario sigue la conversación; una consulta cerrada se reabre. */
  async reply(user: AuthUser, id: string, dto: TicketMessageInputDto): Promise<TicketDto> {
    const created: Notification[] = [];
    await this.dataSource.transaction(async (manager) => {
      const ticket = await manager
        .getRepository(SupportTicket)
        .findOne({ where: { id, userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!ticket) throw ticketNotFound();
      await this.addMessage(manager, ticket.id, user.id, false, dto.body, dto.fileId);
      await manager.getRepository(SupportTicket).update(ticket.id, { status: TicketStatus.OPEN });
      created.push(...(await this.alertAdmins(manager, ticket.id)));
    });
    this.notifications.deliver(created);
    return this.mine(user, id);
  }

  // ---- Admin ------------------------------------------------------------------------------------

  async adminList(query: AdminTicketsQueryDto) {
    const [rows, total] = await this.dataSource.getRepository(SupportTicket).findAndCount({
      where: query.status ? { status: query.status } : {},
      relations: { user: true },
      withDeleted: true,
      order: { updatedAt: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const data: AdminTicketDto[] = [];
    for (const row of rows) data.push(await this.adminView(row));
    return { data, page: query.page, limit: query.limit, total };
  }

  async adminGet(id: string): Promise<AdminTicketDto> {
    const ticket = await this.dataSource
      .getRepository(SupportTicket)
      .findOne({ where: { id }, relations: { user: true }, withDeleted: true });
    if (!ticket) throw ticketNotFound();
    return this.adminView(ticket);
  }

  /** Respuesta del admin: en la plataforma (si tiene cuenta) y por email. */
  async adminReply(admin: AuthUser, id: string, body: string): Promise<AdminTicketDto> {
    const created: Notification[] = [];
    const ticket = await this.dataSource.transaction(async (manager) => {
      const row = await manager
        .getRepository(SupportTicket)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw ticketNotFound();
      await this.addMessage(manager, row.id, admin.id, true, body);
      await manager.getRepository(SupportTicket).update(row.id, { status: TicketStatus.ANSWERED });
      await this.audit.record(
        {
          actorId: admin.id,
          action: 'SUPPORT_REPLIED',
          targetType: 'SUPPORT_TICKET',
          targetId: row.id,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
      if (row.userId) {
        created.push(
          await this.notifications.create(manager, {
            userId: row.userId,
            type: NotificationType.SUPPORT_REPLY,
            title: 'Soporte respondió tu consulta',
            body: body.slice(0, 300),
            targetType: NotificationTarget.SUPPORT_TICKET,
            targetId: row.id,
          }),
        );
      }
      return row;
    });
    this.notifications.deliver(created);
    await this.email(ticket, body);
    return this.adminGet(id);
  }

  async adminClose(admin: AuthUser, id: string): Promise<AdminTicketDto> {
    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .getRepository(SupportTicket)
        .update(id, { status: TicketStatus.CLOSED });
      if (!result.affected) throw ticketNotFound();
      await this.audit.record(
        {
          actorId: admin.id,
          action: 'SUPPORT_CLOSED',
          targetType: 'SUPPORT_TICKET',
          targetId: id,
          reason: null,
          result: 'SUCCESS',
        },
        manager,
      );
    });
    return this.adminGet(id);
  }

  // ---------------------------------------------------------------------------------------------

  private async addMessage(
    manager: EntityManager,
    ticketId: string,
    authorId: string | null,
    fromStaff: boolean,
    body: string,
    fileId?: string,
  ): Promise<void> {
    if (fileId && authorId) {
      await this.uploads.lockReadyFile(manager, authorId, fileId, FilePurpose.EVIDENCE);
      if (await manager.getRepository(SupportMessage).existsBy({ fileId })) {
        throw new ConflictException({
          code: 'FILE_IN_USE',
          message: 'Ese archivo ya está cargado.',
        });
      }
    }
    await manager.getRepository(SupportMessage).insert({
      ticketId,
      authorId,
      fromStaff,
      body,
      fileId: fileId ?? null,
    });
    // Para ordenar las consultas por la última actividad.
    await manager.getRepository(SupportTicket).update(ticketId, { updatedAt: new Date() });
  }

  private alertAdmins(manager: EntityManager, ticketId: string) {
    return this.notifications.createForAdmins(
      manager,
      {
        type: NotificationType.MODERATION_ALERT,
        title: 'Consulta de soporte',
        body: 'Hay una consulta de soporte para responder.',
        targetType: NotificationTarget.SUPPORT_TICKET,
        targetId: ticketId,
      },
      true,
    );
  }

  /** Email con la respuesta. Si falla, queda en la plataforma y se registra (sin datos personales). */
  private async email(ticket: SupportTicket, body: string): Promise<void> {
    const user = ticket.userId
      ? await this.dataSource.getRepository(User).findOneBy({ id: ticket.userId })
      : null;
    const to = user && !user.deletedAt ? user.email : ticket.contactEmail;
    if (!to) return;
    try {
      await this.mail.send({
        to,
        subject: 'Respuesta de soporte de Nexo PRO',
        text: `Hola${user ? ` ${user.firstName}` : ticket.contactName ? ` ${ticket.contactName}` : ''}:\n\n${body}\n\nEl equipo de Nexo PRO`,
      });
    } catch (error) {
      this.logger.error('No se pudo enviar el email de soporte', error as Error);
    }
  }

  private async view(ticket: SupportTicket): Promise<TicketDto> {
    const messages = await this.dataSource.getRepository(SupportMessage).find({
      where: { ticketId: ticket.id },
      order: { createdAt: 'ASC' },
    });
    return {
      id: ticket.id,
      category: ticket.category,
      status: ticket.status,
      messages: messages.map((m) => ({
        id: m.id,
        fromStaff: m.fromStaff,
        body: m.body,
        fileId: m.fileId,
        createdAt: m.createdAt,
      })),
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  private async adminView(ticket: SupportTicket): Promise<AdminTicketDto> {
    return {
      ...(await this.view(ticket)),
      userId: ticket.userId,
      email: ticket.user?.email ?? ticket.contactEmail ?? '',
      name: ticket.user ? `${ticket.user.firstName} ${ticket.user.lastName}` : ticket.contactName,
    };
  }
}
