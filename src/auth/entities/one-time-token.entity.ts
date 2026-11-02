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

export enum OneTimeTokenType {
  EMAIL_VERIFY = 'EMAIL_VERIFY',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

/** Enlaces de un solo uso. El token viaja en el email; acá solo queda su hash. */
@Entity('one_time_tokens')
@Index(['userId', 'type'])
export class OneTimeToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'enum', enum: OneTimeTokenType, enumName: 'one_time_token_type' })
  type: OneTimeTokenType;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
