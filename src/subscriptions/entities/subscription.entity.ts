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

/** Sin débito automático no hay cancelación ni deuda: prueba, pago vigente o vencida (ADR 0026). */
export enum SubscriptionStatus {
  /** Prueba de 30 días desde el registro, con límites de Basic (ADR 0017). */
  TRIAL = 'TRIAL',
  /** Período pago vigente. */
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
}

/** Estados en los que el profesional puede usar sus funciones y aparecer en el catálogo. */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
];

/** Suscripción del profesional. Una sola viva por usuario (índice único parcial). */
@Entity('subscriptions')
@Index(['userId'])
@Index(['planId'])
// Parciales: creados en la migración.
@Index('uq_subscriptions_live', { synchronize: false })
@Index('ix_subscriptions_trial_ends_at', { synchronize: false })
@Check('ck_subscriptions_trial', "status <> 'TRIAL' OR trial_ends_at IS NOT NULL")
@Check('ck_subscriptions_reminder', 'last_reminder_days IS NULL OR last_reminder_days IN (7, 3, 1)')
@Check('ck_subscriptions_amount_paid', 'period_amount_paid IS NULL OR period_amount_paid >= 0')
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

  /**
   * Tramo pago sin cortes (ADR 0026): desde que empezó a regir el plan pago hasta donde está pago,
   * incluidos los meses pagados por adelantado. Vencida, queda el último tramo.
   */
  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  /** Lo pagado por el último mes más las diferencias de mejora: base de la próxima diferencia. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  periodAmountPaid: string | null;

  /** Último recordatorio enviado (7, 3 o 1 días) del fin de la prueba o del período: no se repite. */
  @Column({ type: 'smallint', nullable: true })
  lastReminderDays: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Eventos del historial (columna de texto: sumar uno no cambia la base). */
export const SubscriptionHistoryEvent = {
  TRIAL_STARTED: 'TRIAL_STARTED',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  /** Pago aprobado que activa el plan (desde la prueba o vencida). */
  PAYMENT_APPROVED: 'PAYMENT_APPROVED',
  /** Pago aprobado del mes siguiente. */
  RENEWED: 'RENEWED',
  /** Cambio de plan: por una diferencia pagada o al empezar un período pagado con otro plan. */
  UPGRADED: 'UPGRADED',
  DOWNGRADED: 'DOWNGRADED',
  /** Terminó el período pago sin renovar. */
  EXPIRED: 'EXPIRED',
  /** Reembolso o contracargo: se revierte lo que dio el pago (ADR 0026). */
  PAYMENT_REVERTED: 'PAYMENT_REVERTED',
  /** Cambio de plan del admin, de común acuerdo (con motivo y auditoría). */
  ADMIN_CHANGE: 'ADMIN_CHANGE',
} as const;

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

  /** Ver `SubscriptionHistoryEvent`. */
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
