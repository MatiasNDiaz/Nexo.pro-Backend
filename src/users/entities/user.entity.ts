import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Neighborhood } from '../../locations/entities/neighborhood.entity';
import { StoredFile } from '../../uploads/entities/stored-file.entity';
import { AccountStatus, UserRole, VerificationStatus } from '../user.enums';

/**
 * Identidad y credenciales. Nombre, email y teléfono viven solo acá. Sin DNI (ADR 0006).
 * El barrio es el de residencia y solo lo usan los clientes (ADR 0010).
 */
@Entity('users')
// Único entre cuentas no borradas: índice parcial creado en la migración.
@Index('uq_users_email', { synchronize: false })
@Index(['neighborhoodId'])
@Index(['avatarFileId'])
@Index(['pendingAvatarFileId'])
// Registros por fecha en el panel de ingresos (ADR 0030).
@Index(['createdAt'])
// Parcial (solo cuentas en gracia): creado en la migración.
@Index('ix_users_deletion_scheduled_for', { synchronize: false })
@Check('ck_users_failed_login_attempts', 'failed_login_attempts >= 0')
@Check('ck_users_admin_password', "role <> 'ADMIN' OR password_hash IS NOT NULL")
@Check('ck_users_pending_name', '(pending_first_name IS NULL) = (pending_last_name IS NULL)')
// Las cuentas borradas se anonimizan (ADR 0013) y pierden el barrio.
@Check(
  'ck_users_customer_neighborhood',
  "role <> 'CUSTOMER' OR neighborhood_id IS NOT NULL OR deleted_at IS NOT NULL",
)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'citext' })
  email: string;

  /**
   * Nunca se carga salvo que se pida explícitamente (`addSelect`). Null en cuentas creadas con
   * Google que todavía no definieron contraseña (ADR 0023); el admin siempre tiene.
   */
  @Column({ type: 'text', select: false, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status',
    default: AccountStatus.PENDING_VERIFICATION,
  })
  status: AccountStatus;

  /**
   * Baja en período de gracia (ADR 0016): la cuenta está DEACTIVATED y se anonimiza en esta fecha.
   * Null si no hay una baja pendiente.
   */
  @Column({ type: 'timestamptz', nullable: true })
  deletionScheduledFor: Date | null;

  /** Motivo de la suspensión o el baneo; el usuario lo ve en /auth/me (ADR 0007). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  statusReason: string | null;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.NOT_STARTED,
  })
  verificationStatus: VerificationStatus;

  @Column({ type: 'varchar', length: 60 })
  firstName: string;

  @Column({ type: 'varchar', length: 60 })
  lastName: string;

  /** Nombre nuevo en revisión del admin, con la identidad ya aprobada (ADR 0021). No es público. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  pendingFirstName: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  pendingLastName: string | null;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'uuid', nullable: true })
  neighborhoodId: string | null;

  @ManyToOne(() => Neighborhood, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'neighborhood_id' })
  neighborhood?: Relation<Neighborhood>;

  /** Foto de perfil (paso 2 del registro, ADR 0006). Requisito para aprobar la identidad. */
  @Column({ type: 'uuid', nullable: true })
  avatarFileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'avatar_file_id' })
  avatarFile?: Relation<StoredFile>;

  /** Foto nueva en revisión del admin, con la identidad ya aprobada (ADR 0019). No es pública. */
  @Column({ type: 'uuid', nullable: true })
  pendingAvatarFileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'pending_avatar_file_id' })
  pendingAvatarFile?: Relation<StoredFile>;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
