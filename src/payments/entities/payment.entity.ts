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
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionPlan } from '../../subscriptions/entities/subscription-plan.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { User } from '../../users/entities/user.entity';

export enum PaymentPurpose {
  /** Un mes del plan (activar o renovar). */
  SUBSCRIPTION = 'SUBSCRIPTION',
  /** Diferencia para subir de plan dentro de los 10 días del último pago (C-24). */
  UPGRADE_DIFFERENCE = 'UPGRADE_DIFFERENCE',
}

export enum PaymentStatus {
  /** Checkout creado, todavía sin pago en Mercado Pago. */
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  CHARGED_BACK = 'CHARGED_BACK',
}

/** Tipo de pago para el panel de ingresos (ADR 0030). Se fija al aplicarse. */
export enum PaymentKind {
  /** Primer pago de la cuenta (sin otro anterior que siga en pie). */
  NEW = 'NEW',
  /** Mes siguiente pagado con el período todavía vigente. */
  RENEWAL = 'RENEWAL',
  /** Ya había pagado, se le venció y volvió a pagar. */
  REACTIVATION = 'REACTIVATION',
  /** Diferencia para subir de plan (C-24). */
  UPGRADE = 'UPGRADE',
}

/**
 * Pago de un plan (ADR 0026). Guarda una copia del importe al crearlo y qué dio al aplicarse, para
 * poder revertirlo si después se reembolsa o se desconoce.
 */
@Entity('payments')
@Index(['userId'])
@Index(['subscriptionId'])
@Index(['planId'])
@Index(['previousPlanId'])
// Parciales (panel de ingresos, ADR 0030): creados en la migración.
@Index('ix_payments_approved_at', { synchronize: false })
@Index('ix_payments_money_returned_at', { synchronize: false })
@Check('ck_payments_amount', 'amount > 0')
@Check('ck_payments_kind', 'kind IS NULL OR applied_at IS NOT NULL')
@Check(
  'ck_payments_money_returned',
  "(money_returned_at IS NOT NULL) = (status IN ('REFUNDED', 'CHARGED_BACK'))",
)
@Check('ck_payments_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_payments_provider', "provider IN ('MERCADOPAGO')")
@Check(
  'ck_payments_granted',
  '(granted_from IS NULL) = (granted_until IS NULL) AND (granted_from IS NULL OR granted_until > granted_from)',
)
@Check('ck_payments_reverted', 'reverted_at IS NULL OR applied_at IS NOT NULL')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'uuid' })
  subscriptionId: string;

  @ManyToOne(() => Subscription, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'subscription_id' })
  subscription?: Relation<Subscription>;

  /** Plan que se paga. */
  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'plan_id' })
  plan?: Relation<SubscriptionPlan>;

  @Column({ type: 'enum', enum: PaymentPurpose, enumName: 'payment_purpose' })
  purpose: PaymentPurpose;

  /** Copia del importe al crear el pago (`numeric(12,2)` como texto). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'char', length: 3, default: 'ARS' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.CREATED,
  })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 20 })
  provider: 'MERCADOPAGO';

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerPreferenceId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  providerPaymentId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  /** Cuándo se aplicó a la suscripción. Aprobado sin aplicar = no coincidió (queda auditado). */
  @Column({ type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  /** Tramo de período que dio (solo los pagos de un mes). */
  @Column({ type: 'timestamptz', nullable: true })
  grantedFrom: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  grantedUntil: Date | null;

  /** Plan que tenía la suscripción si este pago lo cambió en el momento. */
  @Column({ type: 'uuid', nullable: true })
  previousPlanId: string | null;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'previous_plan_id' })
  previousPlan?: Relation<SubscriptionPlan>;

  /** Cuándo se revirtió por un reembolso o un contracargo. */
  @Column({ type: 'timestamptz', nullable: true })
  revertedAt: Date | null;

  /** Null hasta que se aplica (un aprobado que no coincidió queda sin tipo). */
  @Column({ type: 'enum', enum: PaymentKind, enumName: 'payment_kind', nullable: true })
  kind: PaymentKind | null;

  /**
   * Cuándo se devolvió la plata (primer aviso de reembolso o contracargo), aunque el pago no se
   * hubiera aplicado. El panel resta el importe en esta fecha (criterio de caja, ADR 0030).
   */
  @Column({ type: 'timestamptz', nullable: true })
  moneyReturnedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Avisos del proveedor. Cada uno se procesa una sola vez (UK proveedor + id del aviso). */
@Entity('payment_events')
@Unique(['provider', 'providerEventId'])
@Index(['paymentId'])
export class PaymentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ type: 'varchar', length: 100 })
  providerEventId: string;

  @Column({ type: 'varchar', length: 60 })
  eventType: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment?: Relation<Payment>;

  /** Solo ids y estados: sin datos personales del pagador. */
  @Column({ type: 'jsonb', default: {} })
  payloadMinimized: Record<string, string | null>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  processingError: string | null;
}
