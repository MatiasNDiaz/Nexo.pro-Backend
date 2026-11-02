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
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum SubscriptionStatus {
  /** Prueba de 30 días desde el registro, con límites de Basic (ADR 0017). */
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  /** Cancelada: sigue vigente hasta el fin del período pago (FI §6.4). */
  CANCEL_AT_PERIOD_END = 'CANCEL_AT_PERIOD_END',
  PAST_DUE = 'PAST_DUE',
  EXPIRED = 'EXPIRED',
}

/** Estados en los que el profesional puede usar sus funciones y aparecer en el catálogo. */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.CANCEL_AT_PERIOD_END,
];

/** Suscripción del profesional. Una sola viva por usuario (índice único parcial). */
@Entity('subscriptions')
@Index(['userId'])
@Index(['planId'])
// Parciales: creados en la migración.
@Index('uq_subscriptions_live', { synchronize: false })
@Index('ix_subscriptions_trial_ends_at', { synchronize: false })
@Check('ck_subscriptions_trial', "status <> 'TRIAL' OR trial_ends_at IS NOT NULL")
@Check(
  'ck_subscriptions_reminder',
  'last_trial_reminder_days IS NULL OR last_trial_reminder_days IN (7, 3, 1)',
)
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'plan_id' })
  plan?: Relation<SubscriptionPlan>;

  @Column({ type: 'enum', enum: SubscriptionStatus, enumName: 'subscription_status' })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  /** Períodos pagos (etapa 9). */
  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  /** Último recordatorio de fin de prueba enviado (7, 3 o 1 días): no se repite. */
  @Column({ type: 'smallint', nullable: true })
  lastTrialReminderDays: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Historial de la suscripción (FI §6.4: se conserva siempre). */
@Entity('subscription_history')
@Index(['subscriptionId'])
@Index(['fromPlanId'])
@Index(['toPlanId'])
@Index(['actorId'])
export class SubscriptionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  subscriptionId: string;

  @ManyToOne(() => Subscription, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: Relation<Subscription>;

  /** TRIAL_STARTED, TRIAL_EXPIRED; la etapa 9 suma los de pagos. */
  @Column({ type: 'varchar', length: 40 })
  event: string;

  @Column({ type: 'uuid', nullable: true })
  fromPlanId: string | null;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'from_plan_id' })
  fromPlan?: Relation<SubscriptionPlan>;

  @Column({ type: 'uuid', nullable: true })
  toPlanId: string | null;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'to_plan_id' })
  toPlan?: Relation<SubscriptionPlan>;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscription_status',
    nullable: true,
  })
  fromStatus: SubscriptionStatus | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscription_status',
    nullable: true,
  })
  toStatus: SubscriptionStatus | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: Relation<User>;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
