import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** Categorías de avisos para las preferencias de push (ADR 0032). */
export enum NotificationCategory {
  MESSAGES = 'MESSAGES',
  REQUESTS = 'REQUESTS',
  ACCOUNT = 'ACCOUNT',
  COMMUNITY = 'COMMUNITY',
  FAVORITES = 'FAVORITES',
  ANNOUNCEMENTS = 'ANNOUNCEMENTS',
  /** Solo el admin: pagos, moderación y seguridad. */
  ADMIN_ALERTS = 'ADMIN_ALERTS',
}

/**
 * Un navegador suscripto a push (ADR 0032). Recibe avisos solo mientras su dispositivo
 * (`familyId`, la familia de sesión) tenga una sesión abierta: al cerrar sesión deja de recibir.
 */
@Entity('push_subscriptions')
@Index(['userId'])
@Index(['familyId'])
@Check('ck_push_subscriptions_endpoint', "endpoint LIKE 'https://%'")
@Check('ck_push_subscriptions_failure_count', 'failure_count >= 0')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'uuid' })
  familyId: string;

  /** URL del servicio de push del navegador (solo hosts conocidos, `isPushServiceEndpoint`). */
  @Column({ type: 'varchar', length: 1000, unique: true })
  endpoint: string;

  /** Clave pública del navegador para cifrar el aviso. */
  @Column({ type: 'varchar', length: 100 })
  p256dh: string;

  @Column({ type: 'varchar', length: 50 })
  auth: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSuccessAt: Date | null;

  /** Fallas seguidas (no 404/410): con 5 se borra. */
  @Column({ type: 'smallint', default: 0 })
  failureCount: number;
}

/** Push apagado o prendido por categoría. Sin fila, prendido (ADR 0032). */
@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @PrimaryColumn({ type: 'enum', enum: NotificationCategory, enumName: 'notification_category' })
  category: NotificationCategory;

  @Column({ type: 'boolean' })
  push: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
