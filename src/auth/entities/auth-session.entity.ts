import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SessionRevokeReason {
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  SESSION_CLOSED = 'SESSION_CLOSED',
  ROTATED = 'ROTATED',
  REUSE_DETECTED = 'REUSE_DETECTED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  ROLE_CHANGED = 'ROLE_CHANGED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  VERIFICATION_REVOKED = 'VERIFICATION_REVOKED',
  ADMIN_REVOKED = 'ADMIN_REVOKED',
}

/**
 * Cada fila es UN refresh token de una cadena de rotación (`familyId` = dispositivo).
 * El `sid` del JWT apunta a la fila vigente (plan §9.4). Solo se guarda el hash del refresh.
 */
@Entity('auth_sessions')
@Index(['userId'])
@Index(['familyId'])
@Index(['replacedById'])
// La limpieza diaria borra las vencidas (etapa 12).
@Index(['expiresAt'])
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'char', length: 64, unique: true })
  refreshTokenHash: string;

  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;

  @ManyToOne(() => AuthSession, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaced_by_id' })
  replacedBy?: Relation<AuthSession>;

  /** Vencimiento por inactividad (se renueva en cada rotación). */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Vencimiento absoluto de la familia: después hay que volver a iniciar sesión. */
  @Column({ type: 'timestamptz' })
  familyExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    type: 'enum',
    enum: SessionRevokeReason,
    enumName: 'session_revoke_reason',
    nullable: true,
  })
  revokeReason: SessionRevokeReason | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  /** HMAC de la IP con DATA_HMAC_KEY: permite comparar sin guardar la IP. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;

  /**
   * HMAC de la cookie de dispositivo (ADR 0031): reconoce un dispositivo ya usado por la cuenta
   * para no avisar por email en cada inicio de sesión. Null en las sesiones anteriores a la 13.2.
   */
  @Column({ type: 'char', length: 64, nullable: true })
  deviceHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
