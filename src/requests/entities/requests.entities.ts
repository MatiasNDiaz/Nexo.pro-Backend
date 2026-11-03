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
import { Conversation } from '../../chat/entities/chat.entities';
import { Profession } from '../../professions/entities/profession.entity';
import { User } from '../../users/entities/user.entity';
import {
  ContractStatus,
  QuoteStatus,
  RequestStatus,
  RequestUrgency,
  TargetStatus,
} from '../request.enums';

/** La necesidad del cliente; puede enviarse a varios profesionales (FI §11.1). */
@Entity('service_requests')
@Index(['customerId'])
@Index(['professionId'])
@Check('ck_service_requests_cancelled', "(status = 'CANCELLED') = (cancelled_at IS NOT NULL)")
export class ServiceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer?: Relation<User>;

  @Column({ type: 'uuid' })
  professionId: string;

  @ManyToOne(() => Profession, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'profession_id' })
  profession?: Relation<Profession>;

  @Column({ type: 'varchar', length: 1000 })
  description: string;

  @Column({ type: 'enum', enum: RequestUrgency, enumName: 'request_urgency' })
  urgency: RequestUrgency;

  @Column({
    type: 'enum',
    enum: RequestStatus,
    enumName: 'request_status',
    default: RequestStatus.OPEN,
  })
  status: RequestStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  cancelReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** La negociación con cada profesional del pedido (ADR 0025), en el chat de la pareja. */
@Entity('service_request_targets')
@Unique(['requestId', 'professionalId'])
@Index(['professionalId'])
@Index(['conversationId'])
export class ServiceRequestTarget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'request_id' })
  request?: Relation<ServiceRequest>;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<User>;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Relation<Conversation>;

  @Column({
    type: 'enum',
    enum: TargetStatus,
    enumName: 'target_status',
    default: TargetStatus.PENDING,
  })
  status: TargetStatus;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Presupuesto. Uno vigente (SENT) por negociación: corregirlo reemplaza al anterior. */
@Entity('quotes')
@Index(['targetId'])
// Parcial: creado en la migración.
@Index('uq_quotes_target_sent', { synchronize: false })
@Check('ck_quotes_amount', 'amount >= 0')
@Check('ck_quotes_currency', "currency ~ '^[A-Z]{3}$'")
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  targetId: string;

  @ManyToOne(() => ServiceRequestTarget, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'target_id' })
  target?: Relation<ServiceRequestTarget>;

  /** `numeric(12,2)` como string para no perder precisión. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'char', length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  proposedDate: Date | null;

  @Column({ type: 'enum', enum: QuoteStatus, enumName: 'quote_status', default: QuoteStatus.SENT })
  status: QuoteStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** La contratación: una por pedido, con el profesional elegido (ADR 0025). */
@Entity('service_contracts')
@Index(['customerId'])
@Index(['professionalId'])
@Index(['acceptedQuoteId'])
export class ServiceContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'request_id' })
  request?: Relation<ServiceRequest>;

  @Column({ type: 'uuid', unique: true })
  targetId: string;

  @ManyToOne(() => ServiceRequestTarget, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'target_id' })
  target?: Relation<ServiceRequestTarget>;

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

  @Column({ type: 'uuid', nullable: true })
  acceptedQuoteId: string | null;

  @ManyToOne(() => Quote, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'accepted_quote_id' })
  acceptedQuote?: Relation<Quote>;

  @Column({
    type: 'enum',
    enum: ContractStatus,
    enumName: 'contract_status',
    default: ContractStatus.ACCEPTED,
  })
  status: ContractStatus;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  cancelReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Solo las transiciones de la contratación (C-11). */
@Entity('service_contract_history')
@Index(['contractId'])
@Index(['actorId'])
export class ServiceContractHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  contractId: string;

  @ManyToOne(() => ServiceContract, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'contract_id' })
  contract?: Relation<ServiceContract>;

  @Column({ type: 'enum', enum: ContractStatus, enumName: 'contract_status', nullable: true })
  fromStatus: ContractStatus | null;

  @Column({ type: 'enum', enum: ContractStatus, enumName: 'contract_status' })
  toStatus: ContractStatus;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: Relation<User>;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
