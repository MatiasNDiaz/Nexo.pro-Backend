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

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  DENIED = 'DENIED',
  FAILED = 'FAILED',
}

export type AuditMetadata = Record<string, string | number | boolean | null>;

/**
 * Acciones administrativas y eventos de seguridad. Append-only: un trigger de la base rechaza
 * UPDATE, DELETE y TRUNCATE (migración CreateAdminAuditLogs).
 */
@Entity('admin_audit_logs')
@Index(['actorId', 'createdAt'])
@Index(['targetType', 'targetId'])
@Index(['action', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null en eventos del sistema (p. ej. reutilización de un refresh token). */
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: Relation<User>;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 60 })
  targetType: string;

  @Column({ type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: AuditMetadata;

  @Column({ type: 'enum', enum: AuditResult, enumName: 'audit_result' })
  result: AuditResult;

  /** HMAC de la IP (la clave llega en la etapa 5). Nunca la IP en claro. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
