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
import { CertStatus } from '../professional.enums';
import { ProfessionalProfile } from './professional-profile.entity';

/**
 * Certificados (ADR 0020): públicos apenas se suben, "cargados por el profesional" (no
 * verificados). El profesional confirma que no muestran datos sensibles; el admin puede ocultarlos.
 */
@Entity('professional_certifications')
@Index(['professionalId'])
@Index(['hiddenBy'])
@Check(
  'ck_professional_certifications_issued_year',
  'issued_year IS NULL OR issued_year BETWEEN 1950 AND 2100',
)
@Check(
  'ck_professional_certifications_hidden',
  "status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL)",
)
export class ProfessionalCertification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  @Column({ type: 'uuid', unique: true })
  fileId: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<StoredFile>;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  institution: string | null;

  @Column({ type: 'smallint', nullable: true })
  issuedYear: number | null;

  @Column({ type: 'enum', enum: CertStatus, enumName: 'cert_status', default: CertStatus.ACTIVE })
  status: CertStatus;

  /** Cuándo confirmó el profesional que el documento no muestra datos sensibles. */
  @Column({ type: 'timestamptz' })
  sensitiveDataConfirmedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  hiddenBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'hidden_by' })
  hider?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  hiddenReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
