import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In } from 'typeorm';
import { ChatEvents, ChatService, type MessageSentEvent } from '../chat/chat.service';
import { Conversation, type Message, MessageSender } from '../chat/entities/chat.entities';
import type { AuthUser } from '../common/decorators';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Profession } from '../professions/entities/profession.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { subscriptionRequired } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import { AccountStatus, UserRole } from '../users/user.enums';
import { type ContractAction, nextContractStatus } from './contract-state-machine';
import type {
  ContractDto,
  CreateRequestDto,
  QuoteDto,
  RequestDto,
  SendQuoteDto,
  TargetDto,
} from './dto/requests.dto';
import {
  Quote,
  ServiceContract,
  ServiceContractHistory,
  ServiceRequest,
  ServiceRequestTarget,
} from './entities/requests.entities';
import {
  ContractStatus,
  QuoteStatus,
  RequestStatus,
  RequestUrgency,
  TargetStatus,
} from './request.enums';

const ZONE = 'America/Argentina/Cordoba';
const URGENCY_LABEL: Record<RequestUrgency, string> = {
  [RequestUrgency.CAN_WAIT]: 'puede esperar',
  [RequestUrgency.IMPATIENT]: 'impaciente',
  [RequestUrgency.URGENT]: 'urgente',
};
/** Negociaciones que todavía pueden cambiar (no terminales). */
const OPEN_TARGETS = [TargetStatus.PENDING, TargetStatus.IN_DISCUSSION, TargetStatus.QUOTED];

const money = (amount: string) =>
  `$${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const when = (date: Date) =>
  date.toLocaleString('es-AR', { timeZone: ZONE, dateStyle: 'short', timeStyle: 'short' });
const invalidTransition = (message: string) =>
  new ConflictException({ code: 'INVALID_STATE_TRANSITION', message });
const notFound = () =>
  new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'La solicitud no existe.' });

/** Lo que una operación deja para avisar después del commit. */
interface Outbox {
  messages: Message[];
  notifications: Notification[];
}

/**
 * Solicitudes, presupuestos y contrataciones (ADR 0025). Todo cambio corre en una transacción con las
 * filas bloqueadas; los mensajes automáticos y las notificaciones se avisan después del commit.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** El cliente envía un pedido a uno o varios profesionales (FI §11.1). */
  async create(customer: AuthUser, dto: CreateRequestDto): Promise<RequestDto> {
    const profession = await this.dataSource
      .getRepository(Profession)
      .findOneBy({ id: dto.professionId, active: true });
    if (!profession) {
      throw new BadRequestException({
        code: 'INVALID_PROFESSION',
        message: 'El oficio no existe.',
      });
    }
    const outbox: Outbox = { messages: [], notifications: [] };
    const request = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceRequest);
      const created = repository.create({
        customerId: customer.id,
        professionId: profession.id,
        description: dto.description,
        urgency: dto.urgency,
      });
      await repository.insert(created);
      for (const professionalId of dto.professionalIds) {
        await this.assertOffers(manager, professionalId, profession.id);
        const conversation = await this.chat.getOrCreate(manager, customer.id, professionalId);
        await manager.getRepository(ServiceRequestTarget).insert({
          requestId: created.id,
          professionalId,
          conversationId: conversation.id,
        });
        outbox.messages.push(
          await this.chat.insertSystemMessage(
            manager,
            conversation,
            `Nueva solicitud de ${profession.name} (${URGENCY_LABEL[dto.urgency]}): ${dto.description}`,
            created.id,
          ),
        );
        outbox.notifications.push(
          await this.notifications.create(manager, {
            userId: professionalId,
            type: NotificationType.NEW_REQUEST,
            title: 'Nueva solicitud',
            body: `Te pidieron un trabajo de ${profession.name}.`,
            targetType: NotificationTarget.REQUEST,
            targetId: created.id,
          }),
        );
      }
      return created;
    });
    await this.flush(outbox);
    return this.getRequest(customer, request.id);
  }

  /** El profesional respondió en el chat: la negociación pasa a "en conversación". */
  @OnEvent(ChatEvents.MESSAGE_SENT, { promisify: true })
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    if (event.senderType !== MessageSender.PROFESSIONAL) return;
    await this.dataSource
      .getRepository(ServiceRequestTarget)
      .update(
        { conversationId: event.conversationId, status: TargetStatus.PENDING },
        { status: TargetStatus.IN_DISCUSSION, respondedAt: new Date() },
      );
  }

  /** El cliente cancela el pedido (antes de elegir). */
  async cancel(customer: AuthUser, requestId: string, reason?: string): Promise<RequestDto> {
    const outbox: Outbox = { messages: [], notifications: [] };
    await this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, requestId);
      if (request.customerId !== customer.id) throw notFound();
      if (request.status !== RequestStatus.OPEN) {
        throw invalidTransition('La solicitud ya no se puede cancelar.');
      }
      const targets = await manager.getRepository(ServiceRequestTarget).find({
        where: { requestId, status: In(OPEN_TARGETS) },
        relations: { conversation: true },
      });
      for (const target of targets) {
        // FI §11.1: si nadie respondió todavía, el mensaje automático de disculpas.
        const text =
          target.status === TargetStatus.PENDING
            ? 'Ya lo solucioné, disculpas por la molestia.'
            : 'El cliente canceló la solicitud.';
        outbox.messages.push(
          await this.chat.insertSystemMessage(manager, target.conversation!, text, requestId),
        );
      }
      await this.closeTargets(manager, targets, TargetStatus.CANCELLED);
      await manager.getRepository(ServiceRequest).update(requestId, {
        status: RequestStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason ?? null,
      });
    });
    await this.flush(outbox);
    return this.getRequest(customer, requestId);
  }

  /** El profesional no toma el pedido. */
  async decline(pro: AuthUser, targetId: string, reason?: string): Promise<RequestDto> {
    await this.requirePlan(pro);
    const outbox: Outbox = { messages: [], notifications: [] };
    const requestId = await this.dataSource.transaction(async (manager) => {
      const target = await this.lockOwnTarget(manager, pro, targetId);
      if (![TargetStatus.PENDING, TargetStatus.IN_DISCUSSION].includes(target.status)) {
        throw invalidTransition('Esta solicitud ya no se puede rechazar.');
      }
      await manager
        .getRepository(ServiceRequestTarget)
        .update(target.id, { status: TargetStatus.DECLINED, respondedAt: new Date() });
      outbox.messages.push(
        await this.chat.insertSystemMessage(
          manager,
          target.conversation!,
          `El profesional no puede tomar este pedido${reason ? `: ${reason}` : '.'}`,
          target.requestId,
        ),
      );
      return target.requestId;
    });
    await this.flush(outbox);
    return this.getRequest(pro, requestId);
  }

  /** Presupuesto (FI §11.2). Uno vigente: corregirlo reemplaza al anterior. */
  async sendQuote(pro: AuthUser, targetId: string, dto: SendQuoteDto): Promise<RequestDto> {
    await this.requirePlan(pro);
    const proposedDate = dto.proposedDate ? new Date(dto.proposedDate) : null;
    if (proposedDate && proposedDate <= new Date()) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'La fecha propuesta tiene que ser en el futuro.',
      });
    }
    const outbox: Outbox = { messages: [], notifications: [] };
    const requestId = await this.dataSource.transaction(async (manager) => {
      const target = await this.lockOwnTarget(manager, pro, targetId);
      if (!OPEN_TARGETS.includes(target.status)) {
        throw invalidTransition('Esta solicitud ya no admite presupuestos.');
      }
      const quotes = manager.getRepository(Quote);
      await quotes.update(
        { targetId, status: QuoteStatus.SENT },
        { status: QuoteStatus.SUPERSEDED },
      );
      const quote = quotes.create({
        targetId,
        amount: dto.amount.toFixed(2),
        description: dto.description ?? null,
        proposedDate,
      });
      await quotes.insert(quote);
      await manager.getRepository(ServiceRequestTarget).update(target.id, {
        status: TargetStatus.QUOTED,
        respondedAt: target.respondedAt ?? new Date(),
      });
      const details = [
        dto.description,
        proposedDate ? `fecha propuesta: ${when(proposedDate)}` : null,
      ].filter(Boolean);
      outbox.messages.push(
        await this.chat.insertSystemMessage(
          manager,
          target.conversation!,
          `Presupuesto: ${money(quote.amount)} ARS${details.length ? ` (${details.join('; ')})` : ''}`,
          target.requestId,
        ),
      );
      outbox.notifications.push(
        await this.notifications.create(manager, {
          userId: target.conversation!.customerId,
          type: NotificationType.QUOTE,
          title: 'Presupuesto nuevo',
          body: `Te mandaron un presupuesto de ${money(quote.amount)} ARS.`,
          targetType: NotificationTarget.REQUEST,
          targetId: target.requestId,
        }),
      );
      return target.requestId;
    });
    await this.flush(outbox);
    return this.getRequest(pro, requestId);
  }

  async withdrawQuote(pro: AuthUser, quoteId: string): Promise<RequestDto> {
    await this.requirePlan(pro);
    const outbox: Outbox = { messages: [], notifications: [] };
    const requestId = await this.dataSource.transaction(async (manager) => {
      const quote = await manager.getRepository(Quote).findOneBy({ id: quoteId });
      if (!quote) throw notFound();
      const target = await this.lockOwnTarget(manager, pro, quote.targetId);
      if (quote.status !== QuoteStatus.SENT || target.status !== TargetStatus.QUOTED) {
        throw invalidTransition('Ese presupuesto ya no está vigente.');
      }
      await manager.getRepository(Quote).update(quote.id, { status: QuoteStatus.WITHDRAWN });
      await manager
        .getRepository(ServiceRequestTarget)
        .update(target.id, { status: TargetStatus.IN_DISCUSSION });
      outbox.messages.push(
        await this.chat.insertSystemMessage(
          manager,
          target.conversation!,
          'El profesional retiró el presupuesto.',
          target.requestId,
        ),
      );
      return target.requestId;
    });
    await this.flush(outbox);
    return this.getRequest(pro, requestId);
  }

  /**
   * El cliente elige a un profesional (FI §11.2): nace la contratación; los demás quedan
   * NOT_SELECTED con el mensaje "El cliente {nombre} ya seleccionó a un profesional".
   */
  async select(customer: AuthUser, targetId: string, quoteId?: string): Promise<ContractDto> {
    const outbox: Outbox = { messages: [], notifications: [] };
    const contractId = await this.dataSource.transaction(async (manager) => {
      const target = await manager
        .getRepository(ServiceRequestTarget)
        .findOne({ where: { id: targetId }, relations: { conversation: true } });
      if (!target) throw notFound();
      const request = await this.lockRequest(manager, target.requestId);
      if (request.customerId !== customer.id) throw notFound();
      if (request.status !== RequestStatus.OPEN) {
        throw invalidTransition('Ya elegiste un profesional o cancelaste la solicitud.');
      }
      if (![TargetStatus.IN_DISCUSSION, TargetStatus.QUOTED].includes(target.status)) {
        throw invalidTransition('Solo podés elegir a un profesional que respondió tu solicitud.');
      }
      await this.assertProfessionalAvailable(target.professionalId);

      const quotes = manager.getRepository(Quote);
      let acceptedQuoteId: string | null = null;
      if (quoteId) {
        const quote = await quotes.findOneBy({ id: quoteId, targetId, status: QuoteStatus.SENT });
        if (!quote) {
          throw new BadRequestException({
            code: 'INVALID_QUOTE',
            message: 'Ese presupuesto no está vigente.',
          });
        }
        await quotes.update(quote.id, { status: QuoteStatus.ACCEPTED });
        acceptedQuoteId = quote.id;
      } else {
        await quotes.update(
          { targetId, status: QuoteStatus.SENT },
          { status: QuoteStatus.REJECTED },
        );
      }
      await manager
        .getRepository(ServiceRequestTarget)
        .update(target.id, { status: TargetStatus.SELECTED });

      const others = await manager.getRepository(ServiceRequestTarget).find({
        where: { requestId: request.id, status: In(OPEN_TARGETS) },
        relations: { conversation: true },
      });
      const me = await manager.getRepository(User).findOneByOrFail({ id: customer.id });
      for (const other of others) {
        outbox.messages.push(
          await this.chat.insertSystemMessage(
            manager,
            other.conversation!,
            `El cliente ${me.firstName} ya seleccionó a un profesional.`,
            request.id,
          ),
        );
      }
      await this.closeTargets(manager, others, TargetStatus.NOT_SELECTED);
      await manager
        .getRepository(ServiceRequest)
        .update(request.id, { status: RequestStatus.SELECTED });

      const contract = manager.getRepository(ServiceContract).create({
        requestId: request.id,
        targetId: target.id,
        customerId: customer.id,
        professionalId: target.professionalId,
        acceptedQuoteId,
      });
      await manager.getRepository(ServiceContract).insert(contract);
      await manager.getRepository(ServiceContractHistory).insert({
        contractId: contract.id,
        fromStatus: null,
        toStatus: ContractStatus.ACCEPTED,
        actorId: customer.id,
      });
      outbox.messages.push(
        await this.chat.insertSystemMessage(
          manager,
          target.conversation!,
          'El cliente te eligió: la contratación quedó confirmada.',
          request.id,
        ),
      );
      outbox.notifications.push(
        await this.notifications.create(manager, {
          userId: target.professionalId,
          type: NotificationType.CONTRACT_UPDATED,
          title: 'Te eligieron',
          body: `${me.firstName} te eligió para el trabajo.`,
          targetType: NotificationTarget.CONTRACT,
          targetId: contract.id,
        }),
      );
      return contract.id;
    });
    await this.flush(outbox);
    return this.getContract(customer, contractId);
  }

  /** Avance o cancelación de la contratación (tabla de transiciones, ADR 0025). */
  async transition(
    user: AuthUser,
    contractId: string,
    action: ContractAction,
    data: { scheduledAt?: Date; reason?: string } = {},
  ): Promise<ContractDto> {
    if (user.role === UserRole.PROFESSIONAL) await this.requirePlan(user);
    if (action === 'SCHEDULE' && (!data.scheduledAt || data.scheduledAt <= new Date())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'La fecha del trabajo tiene que ser en el futuro.',
      });
    }
    const outbox: Outbox = { messages: [], notifications: [] };
    await this.dataSource.transaction(async (manager) => {
      const contract = await manager
        .getRepository(ServiceContract)
        .findOne({ where: { id: contractId }, lock: { mode: 'pessimistic_write' } });
      const actor =
        contract?.customerId === user.id
          ? 'CUSTOMER'
          : contract?.professionalId === user.id
            ? 'PROFESSIONAL'
            : null;
      if (!contract || !actor) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'La contratación no existe.',
        });
      }
      const next = nextContractStatus(contract.status, action, actor);
      if (!next)
        throw invalidTransition(`No se puede hacer eso con una contratación ${contract.status}.`);

      const now = new Date();
      const changes: Partial<ServiceContract> = { status: next };
      let text: string;
      switch (action) {
        case 'SCHEDULE':
          changes.scheduledAt = data.scheduledAt!;
          text = `Trabajo agendado para el ${when(data.scheduledAt!)}.`;
          break;
        case 'START':
          changes.startedAt = now;
          text = 'El profesional empezó el trabajo.';
          break;
        case 'COMPLETE':
          changes.completedAt = now;
          text = 'El profesional marcó el trabajo como terminado.';
          break;
        case 'CANCEL':
          changes.cancelledAt = now;
          changes.cancelReason = data.reason ?? null;
          text = `${actor === 'CUSTOMER' ? 'El cliente' : 'El profesional'} canceló la contratación${data.reason ? `: ${data.reason}` : '.'}`;
          break;
      }
      await manager.getRepository(ServiceContract).update(contract.id, changes);
      await manager.getRepository(ServiceContractHistory).insert({
        contractId: contract.id,
        fromStatus: contract.status,
        toStatus: next,
        actorId: user.id,
        reason: data.reason ?? null,
      });
      const conversation = await this.conversationOf(manager, contract);
      outbox.messages.push(
        await this.chat.insertSystemMessage(manager, conversation, text, contract.requestId),
      );
      outbox.notifications.push(
        await this.notifications.create(manager, {
          userId: actor === 'CUSTOMER' ? contract.professionalId : contract.customerId,
          type: NotificationType.CONTRACT_UPDATED,
          title: 'Contratación actualizada',
          body: text,
          targetType: NotificationTarget.CONTRACT,
          targetId: contract.id,
        }),
      );
    });
    await this.flush(outbox);
    const result = await this.getContract(user, contractId);
    // C-30: el estado de atención no cambia solo; se sugiere "Trabajando".
    return action === 'START' ? { ...result, suggestedAttentionStatus: 'WORKING' } : result;
  }

  // ---- Lecturas ------------------------------------------------------------------------------

  async listForCustomer(customer: AuthUser): Promise<RequestDto[]> {
    const requests = await this.dataSource.getRepository(ServiceRequest).find({
      where: { customerId: customer.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return Promise.all(requests.map((r) => this.toRequest(r, null)));
  }

  async listReceived(pro: AuthUser): Promise<RequestDto[]> {
    await this.requirePlan(pro);
    const targets = await this.dataSource.getRepository(ServiceRequestTarget).find({
      where: { professionalId: pro.id },
      relations: { request: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return Promise.all(targets.map((t) => this.toRequest(t.request!, pro.id)));
  }

  /** El cliente ve todo su pedido; cada profesional, solo su negociación. */
  async getRequest(user: AuthUser, requestId: string): Promise<RequestDto> {
    const request = await this.dataSource
      .getRepository(ServiceRequest)
      .findOneBy({ id: requestId });
    if (!request) throw notFound();
    if (request.customerId === user.id) return this.toRequest(request, null);
    const mine = await this.dataSource
      .getRepository(ServiceRequestTarget)
      .existsBy({ requestId, professionalId: user.id });
    if (!mine) throw notFound();
    return this.toRequest(request, user.id);
  }

  async listContracts(user: AuthUser): Promise<ContractDto[]> {
    if (user.role === UserRole.PROFESSIONAL) await this.requirePlan(user);
    const contracts = await this.dataSource.getRepository(ServiceContract).find({
      where:
        user.role === UserRole.CUSTOMER ? { customerId: user.id } : { professionalId: user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return Promise.all(contracts.map((c) => this.toContract(c)));
  }

  async getContract(user: AuthUser, contractId: string): Promise<ContractDto> {
    const contract = await this.dataSource
      .getRepository(ServiceContract)
      .findOneBy({ id: contractId });
    if (!contract || (contract.customerId !== user.id && contract.professionalId !== user.id)) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'La contratación no existe.',
      });
    }
    return this.toContract(contract);
  }

  // ---------------------------------------------------------------------------------------------

  private async flush(outbox: Outbox): Promise<void> {
    await this.chat.publishMessages(outbox.messages);
    this.notifications.deliver(outbox.notifications);
  }

  private async lockRequest(manager: EntityManager, requestId: string): Promise<ServiceRequest> {
    const request = await manager
      .getRepository(ServiceRequest)
      .findOne({ where: { id: requestId }, lock: { mode: 'pessimistic_write' } });
    if (!request) throw notFound();
    return request;
  }

  /** La negociación del propio profesional, con el pedido abierto y bloqueado. */
  private async lockOwnTarget(
    manager: EntityManager,
    pro: AuthUser,
    targetId: string,
  ): Promise<ServiceRequestTarget> {
    const target = await manager
      .getRepository(ServiceRequestTarget)
      .findOne({ where: { id: targetId }, relations: { conversation: true } });
    if (!target || target.professionalId !== pro.id) throw notFound();
    const request = await this.lockRequest(manager, target.requestId);
    if (request.status !== RequestStatus.OPEN) {
      throw invalidTransition('La solicitud ya no está abierta.');
    }
    return manager
      .getRepository(ServiceRequestTarget)
      .findOneOrFail({ where: { id: targetId }, relations: { conversation: true } });
  }

  private async closeTargets(
    manager: EntityManager,
    targets: ServiceRequestTarget[],
    status: TargetStatus,
  ): Promise<void> {
    if (!targets.length) return;
    const ids = targets.map((t) => t.id);
    await manager.getRepository(ServiceRequestTarget).update({ id: In(ids) }, { status });
    await manager
      .getRepository(Quote)
      .update({ targetId: In(ids), status: QuoteStatus.SENT }, { status: QuoteStatus.REJECTED });
  }

  /** El profesional ofrece ese oficio (activo en su perfil). */
  private async assertOffers(
    manager: EntityManager,
    professionalId: string,
    professionId: string,
  ): Promise<void> {
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM professional_professions pp
         JOIN professional_profiles p ON p.id = pp.professional_id
        WHERE p.user_id = $1 AND pp.profession_id = $2 AND pp.status = 'ACTIVE'
          AND p.deactivated_at IS NULL`,
      [professionalId, professionId],
    );
    if (!rows.length) {
      throw new BadRequestException({
        code: 'PROFESSION_NOT_OFFERED',
        message: 'Alguno de los profesionales no ofrece ese oficio.',
      });
    }
  }

  private async assertProfessionalAvailable(professionalId: string): Promise<void> {
    const professional = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: professionalId });
    const available =
      professional?.status === AccountStatus.ACTIVE &&
      (await this.subscriptions.livePlan(professionalId)) !== null;
    if (!available) {
      throw new ConflictException({
        code: 'PROFESSIONAL_UNAVAILABLE',
        message: 'El profesional no está disponible por ahora.',
      });
    }
  }

  private async requirePlan(pro: AuthUser): Promise<void> {
    if (!(await this.subscriptions.livePlan(pro.id))) throw subscriptionRequired();
  }

  private async conversationOf(
    manager: EntityManager,
    contract: ServiceContract,
  ): Promise<Conversation> {
    const target = await manager
      .getRepository(ServiceRequestTarget)
      .findOneOrFail({ where: { id: contract.targetId }, relations: { conversation: true } });
    return target.conversation!;
  }

  private async toRequest(request: ServiceRequest, onlyFor: string | null): Promise<RequestDto> {
    const manager = this.dataSource.manager;
    const [targets, contract] = await Promise.all([
      manager.getRepository(ServiceRequestTarget).find({
        where: { requestId: request.id, ...(onlyFor && { professionalId: onlyFor }) },
        order: { createdAt: 'ASC' },
      }),
      manager.getRepository(ServiceContract).findOneBy({ requestId: request.id }),
    ]);
    const quotes = targets.length
      ? await manager.getRepository(Quote).find({
          where: {
            targetId: In(targets.map((t) => t.id)),
            status: In([QuoteStatus.SENT, QuoteStatus.ACCEPTED]),
          },
        })
      : [];
    const visibleContract =
      contract && (!onlyFor || contract.professionalId === onlyFor) ? contract.id : null;
    return {
      id: request.id,
      customerId: request.customerId,
      professionId: request.professionId,
      description: request.description,
      urgency: request.urgency,
      status: request.status,
      targets: targets.map((t): TargetDto => ({
        id: t.id,
        requestId: t.requestId,
        professionalId: t.professionalId,
        conversationId: t.conversationId,
        status: t.status,
        currentQuote: toQuote(quotes.find((q) => q.targetId === t.id) ?? null),
      })),
      contractId: visibleContract,
      createdAt: request.createdAt,
    };
  }

  private async toContract(contract: ServiceContract): Promise<ContractDto> {
    const manager = this.dataSource.manager;
    const [target, quote] = await Promise.all([
      manager.getRepository(ServiceRequestTarget).findOneByOrFail({ id: contract.targetId }),
      contract.acceptedQuoteId
        ? manager.getRepository(Quote).findOneBy({ id: contract.acceptedQuoteId })
        : null,
    ]);
    return {
      id: contract.id,
      requestId: contract.requestId,
      customerId: contract.customerId,
      professionalId: contract.professionalId,
      conversationId: target.conversationId,
      status: contract.status,
      acceptedQuote: toQuote(quote),
      scheduledAt: contract.scheduledAt,
      startedAt: contract.startedAt,
      completedAt: contract.completedAt,
      cancelledAt: contract.cancelledAt,
      cancelReason: contract.cancelReason,
      createdAt: contract.createdAt,
    };
  }
}

function toQuote(quote: Quote | null): QuoteDto | null {
  if (!quote) return null;
  return {
    id: quote.id,
    amount: quote.amount,
    currency: quote.currency,
    description: quote.description,
    proposedDate: quote.proposedDate,
    status: quote.status,
    createdAt: quote.createdAt,
  };
}
