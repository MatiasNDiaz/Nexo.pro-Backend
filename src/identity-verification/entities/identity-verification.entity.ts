import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VerificationStatus } from '../../users/user.enums';

/** IDENTITY: verificación de la persona. PROFILE_CHANGE: revisión de foto o nombre nuevos (ADR 0019 y 0021). */
export enum VerificationKind {
  IDENTITY = 'IDENTITY',
  PROFILE_CHANGE = 'PROFILE_CHANGE',
}

export enum DecisionSource {
  PROVIDER = 'PROVIDER',
  ADMIN = 'ADMIN',
}

/**
 * Un intento de verificación de identidad (ADR 0003). Solo estado, proveedor, referencia, motivo y
 * fechas: nunca imágenes de DNI, selfies ni datos biométricos.
 */
@Entity('identity_verifications')
@Unique(['userId', 'attemptNumber'])
@Index(['status', 'submittedAt'])
@Index(['decidedBy'])
// Parciales: creados en la migración.
@Index('uq_identity_verifications_provider_reference', { synchronize: false })
@Index('uq_identity_verifications_open_attempt', { synchronize: false })
@Check('ck_identity_verifications_status', "status <> 'NOT_STARTED'")
@Check('ck_identity_verifications_attempt_number', 'attempt_number > 0')
export class IdentityVerification {
  /** Se genera en la aplicación para poder mandárselo al proveedor antes de insertar. */
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({
    type: 'enum',
    enum: VerificationKind,
    enumName: 'verification_kind',
    default: VerificationKind.IDENTITY,
  })
  kind: VerificationKind;

  @Column({ type: 'enum', enum: VerificationStatus, enumName: 'verification_status' })
  status: VerificationStatus;

  /** MANUAL, FAKE o el proveedor real que se contrate. */
  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  providerReference: string | null;

  @Column({ type: 'smallint' })
  attemptNumber: number;

  @Column({
    type: 'enum',
    enum: DecisionSource,
    enumName: 'verification_decision_source',
    nullable: true,
  })
  decisionSource: DecisionSource | null;

  /** Código de motivo (del proveedor o del admin). Sin datos personales. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reasonCode: string | null;

  /** Nota interna del admin (p. ej. "verificado por videollamada"). Nunca la ve el usuario. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  adminNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'decided_by' })
  decider?: Relation<User>;

  @Column({ type: 'timestamptz' })
  submittedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
