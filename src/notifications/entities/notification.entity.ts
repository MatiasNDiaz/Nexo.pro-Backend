import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  NEW_MESSAGE = 'NEW_MESSAGE',
  NEW_REQUEST = 'NEW_REQUEST',
  QUOTE = 'QUOTE',
  CONTRACT_UPDATED = 'CONTRACT_UPDATED',
  /** Al profesional: pago aplicado, revertido o cambio de plan (ADR 0026). */
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  /** Al admin: pago que no coincide, que no se pudo aplicar, reembolsado o desconocido. */
  PAYMENT_ALERT = 'PAYMENT_ALERT',
  /** ADR 0028: reseña recibida (profesional) y respuesta a la reseña (cliente). */
  REVIEW_RECEIVED = 'REVIEW_RECEIVED',
  REVIEW_REPLIED = 'REVIEW_REPLIED',
  /** Respuesta a una publicación o a una respuesta propia del foro. */
  FORUM_REPLY = 'FORUM_REPLY',
  /** Un favorito se puso "Disponible" (planes con avisos). */
  PROFESSIONAL_AVAILABLE = 'PROFESSIONAL_AVAILABLE',
  /** ADR 0029: al denunciante, cuando se revisó su reporte. */
  REPORT_RESOLVED = 'REPORT_RESOLVED',
  /** Al denunciado, solo cuando el admin marca el reporte como válido (sin decir quién fue). */
  REPORT_UPHELD = 'REPORT_UPHELD',
  /** Strike, advertencia o perfil oculto. */
  MODERATION_ACTION = 'MODERATION_ACTION',
  APPEAL_DECIDED = 'APPEAL_DECIDED',
  /** Al admin: señales de alerta, apelaciones y consultas nuevas. */
  MODERATION_ALERT = 'MODERATION_ALERT',
  SUPPORT_REPLY = 'SUPPORT_REPLY',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  ADMIN_MESSAGE = 'ADMIN_MESSAGE',
  /** Al admin: picos de logins fallidos, tokens reutilizados, 401/403 o 500 (SEG §20.3). */
  SECURITY_ALERT = 'SECURITY_ALERT',
}

export enum NotificationTarget {
  CONVERSATION = 'CONVERSATION',
  REQUEST = 'REQUEST',
  CONTRACT = 'CONTRACT',
  SUBSCRIPTION = 'SUBSCRIPTION',
  PAYMENT = 'PAYMENT',
  REVIEW = 'REVIEW',
  FORUM_POST = 'FORUM_POST',
  /** El id es el del usuario profesional. */
  PROFESSIONAL = 'PROFESSIONAL',
  REPORT = 'REPORT',
  SANCTION = 'SANCTION',
  STRIKE = 'STRIKE',
  APPEAL = 'APPEAL',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  /** El id es el del usuario (alertas del admin). */
  USER = 'USER',
}

/** Notificaciones dentro de la app (P-15). Los canales externos llegan en la etapa 13. */
@Entity('notifications')
@Index(['userId', 'createdAt'])
// Parcial (solo no leídas): creado en la migración.
@Index('ix_notifications_unread', { synchronize: false })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 40 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 300 })
  body: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  targetType: NotificationTarget | null;

  @Column({ type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
