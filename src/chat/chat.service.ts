import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In, LessThan } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import type { AuthUser } from '../common/decorators';
import { Neighborhood } from '../locations/entities/neighborhood.entity';
import {
  NotificationTarget,
  NotificationType,
  type Notification,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfessionalProfile } from '../professionals/entities/professional-profile.entity';
import { OPEN_CONTRACT_STATUSES } from '../requests/contract-state-machine';
import { ServiceContract } from '../requests/entities/requests.entities';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FilePurpose } from '../uploads/file.enums';
import { subscriptionRequired, UploadsService } from '../uploads/uploads.service';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { User } from '../users/entities/user.entity';
import { AccountStatus, UserRole } from '../users/user.enums';
import type { ConversationDto, CounterpartDto, MessageDto, SendMessageDto } from './dto/chat.dto';
import { Conversation, Message, MessageAttachment, MessageSender } from './entities/chat.entities';

/** Se puede editar un mensaje durante 15 minutos (ADR 0024). Eliminar, siempre. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const ChatEvents = {
  /** Después del commit: lo escuchan las solicitudes (el profesional respondió). */
  MESSAGE_SENT: 'chat.message-sent',
} as const;

export interface MessageSentEvent {
  conversationId: string;
  senderType: MessageSender;
}

const notFound = () =>
  new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'La conversación no existe.' });

interface Participation {
  conversation: Conversation;
  role: 'CUSTOMER' | 'PROFESSIONAL';
}

/**
 * Chat cliente-profesional (ADR 0024): un chat por pareja, solo lo inicia el cliente, mensajes por
 * REST y avisos por tiempo real después del commit. Un profesional sin plan vigente no usa el chat;
 * el cliente lee el historial pero no escribe.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly subscriptions: SubscriptionsService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly events: EventEmitter2,
  ) {}

  /** El cliente abre (o recupera) el chat con un profesional visible en el catálogo. */
  async open(customer: AuthUser, professionalId: string): Promise<ConversationDto> {
    const existing = await this.dataSource
      .getRepository(Conversation)
      .findOneBy({ customerId: customer.id, professionalId });
    if (existing) return this.toConversation(customer, existing);
    const conversation = await this.dataSource.transaction((manager) =>
      this.getOrCreate(manager, customer.id, professionalId),
    );
    return this.toConversation(customer, conversation);
  }

  /**
   * Busca o crea el chat de la pareja (también lo usan las solicitudes). Solo con profesionales
   * visibles en el catálogo. `INSERT … ON CONFLICT` evita dos chats por dos clics simultáneos.
   */
  async getOrCreate(
    manager: EntityManager,
    customerId: string,
    professionalId: string,
  ): Promise<Conversation> {
    const repository = manager.getRepository(Conversation);
    const found = await repository.findOneBy({ customerId, professionalId });
    if (found) return found;
    if (!(await this.catalog.isListed(professionalId))) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_NOT_AVAILABLE',
        message: 'Ese profesional no está disponible.',
      });
    }
    await manager.query(
      `INSERT INTO conversations (customer_id, professional_id) VALUES ($1, $2)
       ON CONFLICT (customer_id, professional_id) DO NOTHING`,
      [customerId, professionalId],
    );
    return repository.findOneByOrFail({ customerId, professionalId });
  }

  async list(user: AuthUser): Promise<ConversationDto[]> {
    await this.assertCanUseChat(user);
    let conversations = await this.dataSource.getRepository(Conversation).find({
      where:
        user.role === UserRole.CUSTOMER ? { customerId: user.id } : { professionalId: user.id },
      order: { lastMessageAt: { direction: 'DESC', nulls: 'LAST' }, createdAt: 'DESC' },
      take: 100,
    });
    // Sin plan vigente, el profesional ve solo los chats con una contratación en curso (C-12).
    if (user.role === UserRole.PROFESSIONAL && !(await this.subscriptions.livePlan(user.id))) {
      const open = await this.openContractCustomers(user.id);
      conversations = conversations.filter((c) => open.has(c.customerId));
    }
    return Promise.all(conversations.map((c) => this.toConversation(user, c)));
  }

  async get(user: AuthUser, conversationId: string): Promise<ConversationDto> {
    const { conversation } = await this.participation(user, conversationId);
    return this.toConversation(user, conversation);
  }

  async messages(
    user: AuthUser,
    conversationId: string,
    before: Date | null,
    limit: number,
  ): Promise<MessageDto[]> {
    await this.participation(user, conversationId);
    const rows = await this.dataSource.getRepository(Message).find({
      where: { conversationId, ...(before && { createdAt: LessThan(before) }) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return this.toMessages(rows.reverse());
  }

  async send(user: AuthUser, conversationId: string, dto: SendMessageDto): Promise<MessageDto> {
    const body = dto.body ?? '';
    const attachmentIds = dto.attachmentIds ?? [];
    if (!body && !attachmentIds.length) {
      throw new BadRequestException({
        code: 'EMPTY_MESSAGE',
        message: 'Escribí un mensaje o adjuntá un archivo.',
      });
    }
    const { conversation, role } = await this.participation(user, conversationId);
    if (role === 'CUSTOMER') {
      await this.assertProfessionalCanReply(conversation.professionalId, conversation.customerId);
    } else {
      await this.assertCustomerCanReceive(conversation.customerId);
    }

    const created: Notification[] = [];
    const message = await this.dataSource.transaction(async (manager) => {
      const files: StoredFile[] = [];
      for (const fileId of attachmentIds) {
        files.push(
          await this.uploads.lockReadyFile(manager, user.id, fileId, FilePurpose.CHAT_ATTACHMENT),
        );
      }
      const saved = await this.insertMessage(manager, conversation, {
        senderId: user.id,
        senderType: role === 'CUSTOMER' ? MessageSender.CUSTOMER : MessageSender.PROFESSIONAL,
        body,
        serviceRequestId: null,
      });
      if (files.length) {
        await manager
          .getRepository(MessageAttachment)
          .insert(
            files.map((file, position) => ({ messageId: saved.id, fileId: file.id, position })),
          );
      }
      // Quien escribe leyó todo lo anterior.
      await manager
        .getRepository(Conversation)
        .update(
          conversation.id,
          role === 'CUSTOMER'
            ? { customerLastReadAt: saved.createdAt }
            : { professionalLastReadAt: saved.createdAt },
        );
      const recipient = role === 'CUSTOMER' ? conversation.professionalId : conversation.customerId;
      // Una sola notificación de mensajes nuevos por chat hasta que se lea.
      if (
        !(await this.notifications.hasUnread(
          manager,
          recipient,
          NotificationType.NEW_MESSAGE,
          conversation.id,
        ))
      ) {
        created.push(
          await this.notifications.create(manager, {
            userId: recipient,
            type: NotificationType.NEW_MESSAGE,
            title: 'Mensaje nuevo',
            body: `${user.role === UserRole.CUSTOMER ? 'Un cliente' : 'Un profesional'} te escribió.`,
            targetType: NotificationTarget.CONVERSATION,
            targetId: conversation.id,
          }),
        );
      }
      return saved;
    });

    const [sent] = await this.toMessages([message]);
    this.publish(conversation, 'message:new', sent);
    this.notifications.deliver(created);
    const event: MessageSentEvent = { conversationId, senderType: message.senderType };
    await this.events.emitAsync(ChatEvents.MESSAGE_SENT, event);
    return sent;
  }

  /** Editar: solo el autor y solo durante 15 minutos. Guarda la versión original (ADR 0024). */
  async edit(user: AuthUser, messageId: string, body: string): Promise<MessageDto> {
    if (!body) {
      throw new BadRequestException({ code: 'EMPTY_MESSAGE', message: 'El mensaje está vacío.' });
    }
    const { message, conversation } = await this.ownMessage(user, messageId);
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ConflictException({
        code: 'EDIT_WINDOW_EXPIRED',
        message: 'Los mensajes se pueden editar durante 15 minutos.',
      });
    }
    await this.dataSource.getRepository(Message).update(message.id, {
      body,
      editedAt: new Date(),
      originalBody: message.originalBody ?? message.body,
    });
    return this.publishUpdated(conversation, message.id);
  }

  /** Eliminar: siempre; se oculta para los dos. Guarda la versión original (ADR 0024). */
  async remove(user: AuthUser, messageId: string): Promise<void> {
    const { message, conversation } = await this.ownMessage(user, messageId);
    await this.dataSource.getRepository(Message).update(message.id, {
      deletedAt: new Date(),
      originalBody: message.originalBody ?? message.body,
    });
    await this.publishUpdated(conversation, message.id);
  }

  /** Confirmación de lectura: avisa al otro hasta dónde leyó. */
  async markRead(user: AuthUser, conversationId: string): Promise<void> {
    const { conversation, role } = await this.participation(user, conversationId);
    const readAt = new Date();
    await this.dataSource
      .getRepository(Conversation)
      .update(
        conversation.id,
        role === 'CUSTOMER' ? { customerLastReadAt: readAt } : { professionalLastReadAt: readAt },
      );
    await this.notifications.markReadFor(user.id, conversation.id);
    const other = role === 'CUSTOMER' ? conversation.professionalId : conversation.customerId;
    this.realtime.emitToUser(other, 'conversation:read', { conversationId, readAt });
  }

  /** Un adjunto: solo para los dos participantes y si el mensaje no se eliminó. */
  async attachment(user: AuthUser, fileId: string) {
    const attachment = await this.dataSource.getRepository(MessageAttachment).findOne({
      where: { fileId },
      relations: { message: true, file: true },
    });
    if (!attachment?.message || !attachment.file || attachment.message.deletedAt) {
      throw new NotFoundException();
    }
    await this.participation(user, attachment.message.conversationId);
    return this.uploads.privateContent(attachment.file);
  }

  /** Mensaje automático en la transacción del llamador (solicitudes y contrataciones). */
  insertSystemMessage(
    manager: EntityManager,
    conversation: Conversation,
    body: string,
    serviceRequestId: string | null,
  ): Promise<Message> {
    return this.insertMessage(manager, conversation, {
      senderId: null,
      senderType: MessageSender.SYSTEM,
      body,
      serviceRequestId,
    });
  }

  /** Avisa por tiempo real los mensajes creados en una transacción ya confirmada. */
  async publishMessages(messages: Message[]): Promise<void> {
    if (!messages.length) return;
    const conversations = await this.dataSource
      .getRepository(Conversation)
      .findBy({ id: In([...new Set(messages.map((m) => m.conversationId))]) });
    const dtos = await this.toMessages(messages);
    for (const dto of dtos) {
      const conversation = conversations.find((c) => c.id === dto.conversationId);
      if (conversation) this.publish(conversation, 'message:new', dto);
    }
  }

  // ---------------------------------------------------------------------------------------------

  private async insertMessage(
    manager: EntityManager,
    conversation: Conversation,
    data: Pick<Message, 'senderId' | 'senderType' | 'body' | 'serviceRequestId'>,
  ): Promise<Message> {
    const repository = manager.getRepository(Message);
    const message = repository.create({ conversationId: conversation.id, ...data });
    await repository.insert(message);
    const saved = await repository.findOneByOrFail({ id: message.id });
    await manager
      .getRepository(Conversation)
      .update(conversation.id, { lastMessageAt: saved.createdAt });
    return saved;
  }

  /** Participante del chat (si no, 404: no confirma que existe). El profesional necesita plan. */
  private async participation(user: AuthUser, conversationId: string): Promise<Participation> {
    const conversation = await this.dataSource
      .getRepository(Conversation)
      .findOneBy({ id: conversationId });
    if (!conversation) throw notFound();
    if (conversation.customerId === user.id) return { conversation, role: 'CUSTOMER' };
    if (conversation.professionalId !== user.id) throw notFound();
    await this.assertCanUseChat(user, conversation.customerId);
    return { conversation, role: 'PROFESSIONAL' };
  }

  /**
   * FI §12: un profesional sin prueba ni plan vigente no usa el chat, salvo con un cliente con el
   * que tiene una contratación en curso, hasta que se cierre (C-12, ADR 0027). Sin cliente (la
   * lista), alcanza con tener alguna en curso.
   */
  private async assertCanUseChat(user: AuthUser, customerId?: string): Promise<void> {
    if (user.role !== UserRole.PROFESSIONAL) return;
    if (!(await this.professionalCanChat(user.id, customerId))) throw subscriptionRequired();
  }

  private async professionalCanChat(professionalId: string, customerId?: string) {
    if (await this.subscriptions.livePlan(professionalId)) return true;
    const open = await this.openContractCustomers(professionalId);
    return customerId === undefined ? open.size > 0 : open.has(customerId);
  }

  /** Clientes con los que el profesional tiene una contratación en curso. */
  private async openContractCustomers(professionalId: string): Promise<Set<string>> {
    const contracts = await this.dataSource.getRepository(ServiceContract).find({
      where: { professionalId, status: In([...OPEN_CONTRACT_STATUSES]) },
      select: { customerId: true },
    });
    return new Set(contracts.map((c) => c.customerId));
  }

  /** El cliente solo escribe si el profesional puede responder (activo y con plan, o C-12). */
  private async assertProfessionalCanReply(
    professionalId: string,
    customerId: string,
  ): Promise<void> {
    const professional = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: professionalId });
    const available =
      professional?.status === AccountStatus.ACTIVE &&
      professional.role === UserRole.PROFESSIONAL &&
      (await this.professionalCanChat(professionalId, customerId));
    if (!available) {
      throw new ConflictException({
        code: 'PROFESSIONAL_UNAVAILABLE',
        message: 'El profesional no está disponible por ahora. Podés leer la conversación.',
      });
    }
  }

  /** El profesional no le escribe a un cliente que dio de baja su cuenta: nadie lo leería. */
  private async assertCustomerCanReceive(customerId: string): Promise<void> {
    // Anonimizada, la cuenta está borrada: sin withDeleted no aparecería.
    const customer = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: customerId }, withDeleted: true });
    if (!customer || customer.status === AccountStatus.DEACTIVATED) {
      throw new ConflictException({
        code: 'CUSTOMER_UNAVAILABLE',
        message: 'El cliente dio de baja su cuenta. Podés leer la conversación.',
      });
    }
  }

  private async ownMessage(user: AuthUser, messageId: string) {
    const message = await this.dataSource.getRepository(Message).findOneBy({ id: messageId });
    if (!message || message.senderId !== user.id || message.deletedAt) {
      throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'El mensaje no existe.' });
    }
    const { conversation } = await this.participation(user, message.conversationId);
    return { message, conversation };
  }

  private async publishUpdated(conversation: Conversation, messageId: string): Promise<MessageDto> {
    const message = await this.dataSource.getRepository(Message).findOneByOrFail({ id: messageId });
    const [dto] = await this.toMessages([message]);
    this.publish(conversation, 'message:updated', dto);
    return dto;
  }

  private publish(conversation: Conversation, event: string, payload: MessageDto): void {
    this.realtime.emitToUser(conversation.customerId, event, payload);
    this.realtime.emitToUser(conversation.professionalId, event, payload);
  }

  /** Mensajes para los participantes: sin versión original y vacíos si se eliminaron. */
  private async toMessages(messages: Message[]): Promise<MessageDto[]> {
    const attachments = messages.length
      ? await this.dataSource.getRepository(MessageAttachment).find({
          where: { messageId: In(messages.map((m) => m.id)) },
          relations: { file: true },
          order: { position: 'ASC' },
        })
      : [];
    return messages.map((m) => {
      const deleted = m.deletedAt !== null;
      return {
        id: m.id,
        conversationId: m.conversationId,
        senderType: m.senderType,
        senderId: m.senderId,
        body: deleted ? '' : m.body,
        edited: m.editedAt !== null,
        deleted,
        serviceRequestId: m.serviceRequestId,
        attachments: deleted
          ? []
          : attachments
              .filter((a) => a.messageId === m.id)
              .map((a) => ({
                fileId: a.fileId,
                kind: a.file?.kind ?? 'IMAGE',
                mimeType: a.file?.mimeType ?? null,
              })),
        createdAt: m.createdAt,
      };
    });
  }

  private async toConversation(user: AuthUser, c: Conversation): Promise<ConversationDto> {
    const myRole = c.customerId === user.id ? 'CUSTOMER' : 'PROFESSIONAL';
    const otherId = myRole === 'CUSTOMER' ? c.professionalId : c.customerId;
    const myReadAt = myRole === 'CUSTOMER' ? c.customerLastReadAt : c.professionalLastReadAt;
    const manager = this.dataSource.manager;
    const [other, last, unread] = await Promise.all([
      // La otra parte puede estar anonimizada (H-02): se muestra como «Cuenta eliminada».
      manager.getRepository(User).findOneOrFail({ where: { id: otherId }, withDeleted: true }),
      manager.getRepository(Message).findOne({
        where: { conversationId: c.id },
        order: { createdAt: 'DESC' },
      }),
      manager
        .getRepository(Message)
        .createQueryBuilder('m')
        .where('m.conversationId = :id AND m.deletedAt IS NULL', { id: c.id })
        .andWhere('(m.senderId IS NULL OR m.senderId <> :me)', { me: user.id })
        .andWhere(myReadAt ? 'm.createdAt > :readAt' : 'TRUE', { readAt: myReadAt })
        .getCount(),
    ]);
    const { avatarUrl } = await this.uploads.avatarUrls(other);
    const deactivated = other.status === AccountStatus.DEACTIVATED;
    const counterpart: CounterpartDto = {
      userId: other.id,
      firstName: other.firstName,
      lastName: other.lastName,
      avatarUrl,
      deactivated,
    };
    if (myRole === 'CUSTOMER') {
      const profile = await manager
        .getRepository(ProfessionalProfile)
        .findOneBy({ userId: other.id });
      // Dado de baja, su perfil ya no se publica: no hay a dónde enlazar.
      counterpart.slug = deactivated ? null : (profile?.slug ?? null);
      counterpart.businessName = profile?.businessName ?? null;
    } else {
      // C-13: el profesional ve el barrio y los datos útiles del cliente que le escribió.
      const [neighborhood, customerProfile] = await Promise.all([
        other.neighborhoodId
          ? manager.getRepository(Neighborhood).findOneBy({ id: other.neighborhoodId })
          : null,
        manager.getRepository(CustomerProfile).findOneBy({ userId: other.id }),
      ]);
      counterpart.neighborhoodName = neighborhood?.name ?? null;
      counterpart.extraInfo = customerProfile?.extraInfo ?? null;
    }
    const canWrite =
      myRole === 'PROFESSIONAL'
        ? !deactivated
        : await this.assertProfessionalCanReply(c.professionalId, c.customerId).then(
            () => true,
            () => false,
          );
    return {
      id: c.id,
      myRole,
      counterpart,
      lastMessage: last ? (await this.toMessages([last]))[0] : null,
      unread,
      counterpartReadAt: myRole === 'CUSTOMER' ? c.professionalLastReadAt : c.customerLastReadAt,
      canWrite,
      lastMessageAt: c.lastMessageAt,
    };
  }
}
