import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

const bigintToNumber = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/** Segundo factor TOTP (obligatorio para el admin). El secreto se guarda cifrado (AES-256-GCM). */
@Entity('user_mfa_settings')
export class UserMfaSettings {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  // ManyToOne + PK en user_id = uno a uno, sin el constraint extra que agrega @OneToOne.
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'text' })
  totpSecretEncrypted: string;

  /** SHA-256 de los códigos de recuperación sin usar. */
  @Column({ type: 'jsonb', default: [] })
  recoveryCodeHashes: string[];

  /** Último paso de tiempo TOTP aceptado: un código no se puede usar dos veces. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintToNumber })
  lastUsedStep: number | null;

  @Column({ type: 'timestamptz' })
  enabledAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
