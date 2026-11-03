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
}

export enum NotificationTarget {
  CONVERSATION = 'CONVERSATION',
  REQUEST = 'REQUEST',
  CONTRACT = 'CONTRACT',
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
