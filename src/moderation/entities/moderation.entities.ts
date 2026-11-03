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
import { StoredFile } from '../../uploads/entities/stored-file.entity';
import { User } from '../../users/entities/user.entity';

/** Qué se reporta (FI §20.1). PROFILE apunta al usuario; el resto, a su fila. */
export enum ReportTarget {
  PROFILE = 'PROFILE',
  MESSAGE = 'MESSAGE',
  FORUM_POST = 'FORUM_POST',
  FORUM_REPLY = 'FORUM_REPLY',
  REVIEW = 'REVIEW',
}

/** Motivos aprobados el 03/11/2026 (ADR 0029). */
export enum ReportReason {
  DISCRIMINATION = 'DISCRIMINATION',
  DISRESPECT = 'DISRESPECT',
  HARASSMENT = 'HARASSMENT',
  NO_SHOW = 'NO_SHOW',
  NOT_AS_AGREED = 'NOT_AS_AGREED',
  FRAUD = 'FRAUD',
  THREATS = 'THREATS',
  OFFENSIVE_CONTENT = 'OFFENSIVE_CONTENT',
  SPAM = 'SPAM',
  OTHER = 'OTHER',
}

export enum ReportStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  VALID = 'VALID',
  REJECTED = 'REJECTED',
}

export const OPEN_REPORT_STATUSES = [ReportStatus.SUBMITTED, ReportStatus.UNDER_REVIEW] as const;

export enum SanctionType {
  WARNING = 'WARNING',
  SUSPENSION = 'SUSPENSION',
  BAN = 'BAN',
  /** C-29: la cuenta sigue, el perfil profesional no aparece en el catálogo. */
  PROFILE_HIDDEN = 'PROFILE_HIDDEN',
}

export enum AppealStatus {
  OPEN = 'OPEN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

/** Reporte (ADR 0029). La identidad del denunciante nunca sale hacia el denunciado. */
@Entity('reports')
// Parcial (un reporte abierto por persona y contenido): creado en la migración.
@Index('uq_reports_open', { synchronize: false })
@Index(['reporterId'])
@Index(['reportedUserId'])
@Index(['resolvedBy'])
@Index(['targetType', 'targetId'])
@Index(['status'])
@Check('ck_reports_not_self', 'reporter_id <> reported_user_id')
@Check('ck_reports_resolved', "(status IN ('VALID', 'REJECTED')) = (resolved_at IS NOT NULL)")
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'reporter_id' })
  reporter?: Relation<User>;

  @Column({ type: 'enum', enum: ReportTarget, enumName: 'report_target' })
  targetType: ReportTarget;

  /** Sin FK: apunta a cinco tablas distintas según `targetType`. */
  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'uuid' })
  reportedUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'reported_user_id' })
  reportedUser?: Relation<User>;

  @Column({ type: 'enum', enum: ReportReason, enumName: 'report_reason' })
  reason: ReportReason;

  @Column({ type: 'varchar', length: 2000 })
  description: string;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    enumName: 'report_status',
    default: ReportStatus.SUBMITTED,
  })
  status: ReportStatus;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolver?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  resolutionNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Fotos privadas del reporte (hasta 3, en el servicio). */
@Entity('report_evidence')
@Index(['reportId'])
@Check('ck_report_evidence_position', 'position >= 0')
export class ReportEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reportId: string;

  @ManyToOne(() => Report, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'report_id' })
  report?: Relation<Report>;

  @Column({ type: 'uuid', unique: true })
  fileId: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<StoredFile>;

  @Column({ type: 'smallint', default: 0 })
  position: number;
}

/** Strike asignado a mano por el admin, con peso de 1 a 3 (C-09, ADR 0029). */
@Entity('strikes')
@Index(['userId'])
@Index(['reportId'])
@Index(['appliedBy'])
@Index(['voidedBy'])
@Check('ck_strikes_weight', 'weight BETWEEN 1 AND 3')
@Check('ck_strikes_voided', '(voided_at IS NULL) = (void_reason IS NULL)')
export class Strike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'uuid', nullable: true })
  reportId: string | null;

  @ManyToOne(() => Report, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'report_id' })
  report?: Relation<Report>;

  @Column({ type: 'smallint' })
  weight: number;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'uuid' })
  appliedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'applied_by' })
  applier?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  voidedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'voided_by' })
  voider?: Relation<User>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  voidReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/**
 * Sanción (ADR 0029): historial de advertencias, suspensiones, baneos y perfiles ocultos. Las
 * suspensiones y los baneos además cambian `users.status` (etapa 6).
 */
@Entity('sanctions')
@Index(['userId'])
@Index(['reportId'])
@Index(['appliedBy'])
@Index(['liftedBy'])
// Parcial (las que vencen): creado en la migración.
@Index('ix_sanctions_expiring', { synchronize: false })
@Check(
  'ck_sanctions_ends',
  "ends_at IS NULL OR (type IN ('SUSPENSION', 'PROFILE_HIDDEN') AND ends_at > starts_at)",
)
@Check('ck_sanctions_lifted', '(lifted_at IS NULL) = (lift_reason IS NULL)')
export class Sanction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'enum', enum: SanctionType, enumName: 'sanction_type' })
  type: SanctionType;

  @Column({ type: 'uuid', nullable: true })
  reportId: string | null;

  @ManyToOne(() => Report, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'report_id' })
  report?: Relation<Report>;

  /** El usuario lo ve. */
  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startsAt: Date;

  /** null = hasta que el admin la levante. */
  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  /** null en las copiadas de antes de la etapa 11. */
  @Column({ type: 'uuid', nullable: true })
  appliedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'applied_by' })
  applier?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  liftedAt: Date | null;

  /** null si se levantó sola al llegar la fecha de fin. */
  @Column({ type: 'uuid', nullable: true })
  liftedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'lifted_by' })
  lifter?: Relation<User>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  liftReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Apelación de un strike o de una sanción (una abierta por cada uno). */
@Entity('appeals')
@Index('uq_appeals_open_strike', { synchronize: false })
@Index('uq_appeals_open_sanction', { synchronize: false })
@Index(['userId'])
@Index(['strikeId'])
@Index(['sanctionId'])
@Index(['decidedBy'])
@Check('ck_appeals_target', '(strike_id IS NULL) <> (sanction_id IS NULL)')
@Check('ck_appeals_decided', "(status = 'OPEN') = (decided_at IS NULL)")
export class Appeal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'uuid', nullable: true })
  strikeId: string | null;

  @ManyToOne(() => Strike, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'strike_id' })
  strike?: Relation<Strike>;

  @Column({ type: 'uuid', nullable: true })
  sanctionId: string | null;

  @ManyToOne(() => Sanction, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sanction_id' })
  sanction?: Relation<Sanction>;

  @Column({ type: 'varchar', length: 2000 })
  body: string;

  @Column({
    type: 'enum',
    enum: AppealStatus,
    enumName: 'appeal_status',
    default: AppealStatus.OPEN,
  })
  status: AppealStatus;

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'decided_by' })
  decider?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  decisionNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
