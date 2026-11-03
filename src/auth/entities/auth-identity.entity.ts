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
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum OAuthProviderName {
  GOOGLE = 'GOOGLE',
}

export enum OAuthRequestKind {
  /** El email de Google ya tiene cuenta: falta probar que es del dueño (ADR 0015). */
  LINK = 'LINK',
  /** Cuenta nueva: faltan los datos obligatorios del registro. */
  SIGNUP = 'SIGNUP',
}

/** Cuenta de Google vinculada (ADR 0015). Una por usuario y un usuario por cuenta de Google. */
@Entity('auth_identities')
@Unique(['provider', 'providerSubject'])
@Unique(['userId', 'provider'])
@Check('ck_auth_identities_provider', "provider IN ('GOOGLE')")
export class AuthIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 20 })
  provider: OAuthProviderName;

  /** `sub` del ID token: el identificador estable de la persona en Google. */
  @Column({ type: 'varchar', length: 255 })
  providerSubject: string;

  /** Email de Google al vincular (para soporte; el email de la cuenta vive en `users`). */
  @Column({ type: 'citext' })
  emailAtLink: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;
}

/**
 * Vinculación o registro con Google a medio terminar (30 minutos). Solo se guardan los hashes de los
 * tokens: el del navegador (cookie) y, si se confirma por email, el del enlace.
 */
@Entity('oauth_pending_requests')
@Index(['userId'])
@Check('ck_oauth_pending_requests_link_user', "(kind = 'LINK') = (user_id IS NOT NULL)")
@Check('ck_oauth_pending_requests_provider', "provider IN ('GOOGLE')")
export class OAuthPendingRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: OAuthRequestKind, enumName: 'oauth_request_kind' })
  kind: OAuthRequestKind;

  @Column({ type: 'varchar', length: 20 })
  provider: OAuthProviderName;

  @Column({ type: 'varchar', length: 255 })
  providerSubject: string;

  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  lastName: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'char', length: 64, unique: true, nullable: true })
  emailTokenHash: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
