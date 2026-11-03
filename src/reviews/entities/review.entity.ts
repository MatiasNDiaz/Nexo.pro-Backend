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
import { ContentStatus, HIDDEN_CHECK } from '../../common/content-status';
import { ServiceContract } from '../../requests/entities/requests.entities';
import { User } from '../../users/entities/user.entity';

/**
 * Reseña de una contratación terminada (ADR 0028): una por contratación (sin contar las borradas),
 * con la respuesta pública del profesional en la misma fila.
 */
@Entity('reviews')
// Parcial (solo las no borradas): creado en la migración.
@Index('uq_reviews_contract_live', { synchronize: false })
@Index(['contractId'])
@Index(['customerId'])
@Index(['professionalId'])
@Index(['hiddenBy'])
@Check('ck_reviews_rating', 'rating BETWEEN 1 AND 5')
@Check('ck_reviews_reply', '(reply_body IS NULL) = (replied_at IS NULL)')
@Check('ck_reviews_hidden', HIDDEN_CHECK)
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  contractId: string;

  @ManyToOne(() => ServiceContract, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'contract_id' })
  contract?: Relation<ServiceContract>;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer?: Relation<User>;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<User>;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  /** Respuesta pública del profesional. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  replyBody: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ContentStatus,
    enumName: 'content_status',
    default: ContentStatus.VISIBLE,
  })
  status: ContentStatus;

  @Column({ type: 'uuid', nullable: true })
  hiddenBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'hidden_by' })
  hider?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  hiddenReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Opinión sobre la plataforma (ADR 0028): una por usuario, pública solo si el admin la publica. */
@Entity('platform_reviews')
@Check('ck_platform_reviews_rating', 'rating BETWEEN 1 AND 5')
export class PlatformReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
