import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DecisionSource, VerificationStatus } from '../verification-status.enum';

@Entity({ name: 'identity_verifications' })
@Index('uq_identity_verifications_provider_ref', ['provider', 'providerReference'], {
  unique: true,
  where: '"provider_reference" IS NOT NULL',
})
@Index('uq_identity_verifications_open_attempt', ['userId'], {
  unique: true,
  where: `"status" IN ('PENDING', 'REQUIRES_REVIEW')`,
})
export class IdentityVerification {
  /** Se genera en la aplicación para poder enviarlo al proveedor antes de insertar. */
  @PrimaryColumn('uuid')
  id: string;

  @Index('ix_identity_verifications_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: VerificationStatus, enumName: 'verification_status' })
  status: VerificationStatus;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ name: 'provider_reference', type: 'varchar', length: 200, nullable: true })
  providerReference: string | null;

  @Column({ name: 'attempt_number', type: 'smallint' })
  attemptNumber: number;

  @Column({ name: 'decision_source', type: 'enum', enum: DecisionSource, enumName: 'verification_decision_source', nullable: true })
  decisionSource: DecisionSource | null;

  /** Código de motivo (del proveedor o del admin). Sin datos personales. */
  @Column({ name: 'reason_code', type: 'varchar', length: 100, nullable: true })
  reasonCode: string | null;

  /** Nota interna del admin (p. ej. "verificado por videollamada"). Nunca se muestra al usuario. */
  @Column({ name: 'admin_note', type: 'varchar', length: 500, nullable: true })
  adminNote: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
