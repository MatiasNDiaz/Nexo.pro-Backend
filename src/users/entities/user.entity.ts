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
import { AccountStatus, UserRole, VerificationStatus } from '../user.enums';

/**
 * Identidad y credenciales. Nombre, email y teléfono viven solo acá. Sin DNI (ADR 0006).
 * El barrio es el de residencia y solo lo usan los clientes (ADR 0010).
 */
@Entity('users')
// Único entre cuentas no borradas: índice parcial creado en la migración.
@Index('uq_users_email', { synchronize: false })
@Index(['neighborhoodId'])
@Check('ck_users_failed_login_attempts', 'failed_login_attempts >= 0')
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

  /** Nunca se carga salvo que se pida explícitamente (`addSelect`). */
  @Column({ type: 'text', select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status',
    default: AccountStatus.PENDING_VERIFICATION,
  })
  status: AccountStatus;

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

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'uuid', nullable: true })
  neighborhoodId: string | null;

  @ManyToOne(() => Neighborhood, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'neighborhood_id' })
  neighborhood?: Relation<Neighborhood>;

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
