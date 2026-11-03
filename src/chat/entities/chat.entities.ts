import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { ServiceRequest } from '../../requests/entities/requests.entities';
import { StoredFile } from '../../uploads/entities/stored-file.entity';
import { User } from '../../users/entities/user.entity';

export enum MessageSender {
  CUSTOMER = 'CUSTOMER',
  PROFESSIONAL = 'PROFESSIONAL',
  /** Mensajes automáticos (selección de otro profesional, cancelaciones, cambios de estado). */
  SYSTEM = 'SYSTEM',
}

/** Un chat por pareja cliente-profesional; solo lo inicia el cliente (ADR 0024). */
@Entity('conversations')
@Unique(['customerId', 'professionalId'])
@Index(['professionalId'])
@Check('ck_conversations_participants', 'customer_id <> professional_id')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer?: Relation<User>;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<User>;

  /** Confirmación de lectura: hasta dónde leyó cada uno. */
  @Column({ type: 'timestamptz', nullable: true })
  customerLastReadAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  professionalLastReadAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/**
 * Mensaje. Editar: solo 15 minutos; eliminar: siempre (se oculta). La primera edición o la
 * eliminación guarda el texto original en `originalBody`, visible solo para el admin ante un reporte
 * (ADR 0024). Nunca se devuelve a los participantes.
 */
@Entity('messages')
@Index(['conversationId', 'createdAt'])
@Index(['senderId'])
@Index(['serviceRequestId'])
@Check('ck_messages_sender', "(sender_type = 'SYSTEM') = (sender_id IS NULL)")
@Check('ck_messages_body', 'char_length(body) <= 2000')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Relation<Conversation>;

  @Column({ type: 'uuid', nullable: true })
  senderId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sender_id' })
  sender?: Relation<User>;

  @Column({ type: 'enum', enum: MessageSender, enumName: 'message_sender' })
  senderType: MessageSender;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ type: 'text', nullable: true })
  originalBody: string | null;

  @Column({ type: 'uuid', nullable: true })
  serviceRequestId: string | null;

  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: Relation<ServiceRequest>;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Adjuntos de un mensaje: archivos privados (solo los dos participantes). */
@Entity('message_attachments')
@Index(['messageId'])
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @ManyToOne(() => Message, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'message_id' })
  message?: Relation<Message>;

  @Column({ type: 'uuid', unique: true })
  fileId: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<StoredFile>;

  @Column({ type: 'smallint', default: 0 })
  position: number;
}
