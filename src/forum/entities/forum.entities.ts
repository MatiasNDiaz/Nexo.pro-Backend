import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ContentStatus, HIDDEN_CHECK } from '../../common/content-status';
import { Locality } from '../../locations/entities/locality.entity';
import { Neighborhood } from '../../locations/entities/neighborhood.entity';
import { Profession } from '../../professions/entities/profession.entity';
import { StoredFile } from '../../uploads/entities/stored-file.entity';
import { User } from '../../users/entities/user.entity';

export enum ForumPostType {
  /** "Consulta": pide consejo a la comunidad. */
  QUESTION = 'QUESTION',
  /** "Solicito profesional": busca a alguien para un trabajo. */
  PROFESSIONAL_WANTED = 'PROFESSIONAL_WANTED',
}

/** Publicación del foro (FI §13, ADR 0028). Resuelta no admite respuestas nuevas. */
@Entity('forum_posts')
@Index(['authorId'])
@Index(['localityId'])
@Index(['neighborhoodId'])
@Index(['hiddenBy'])
@Index(['createdAt'])
@Check('ck_forum_posts_neighborhood', 'neighborhood_id IS NULL OR locality_id IS NOT NULL')
@Check('ck_forum_posts_budget', 'budget_estimate IS NULL OR budget_estimate > 0')
@Check('ck_forum_posts_hidden', HIDDEN_CHECK)
export class ForumPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'author_id' })
  author?: Relation<User>;

  @Column({ type: 'enum', enum: ForumPostType, enumName: 'forum_post_type' })
  type: ForumPostType;

  @Column({ type: 'varchar', length: 2000 })
  body: string;

  @Column({ type: 'uuid', nullable: true })
  localityId: string | null;

  @ManyToOne(() => Locality, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'locality_id' })
  locality?: Relation<Locality>;

  @Column({ type: 'uuid', nullable: true })
  neighborhoodId: string | null;

  /** FK compuesta: el barrio tiene que pertenecer a la localidad. */
  @ManyToOne(() => Neighborhood, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn([
    { name: 'neighborhood_id', referencedColumnName: 'id' },
    { name: 'locality_id', referencedColumnName: 'localityId' },
  ])
  neighborhood?: Relation<Neighborhood>;

  /** `numeric(12,2)` como texto. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  budgetEstimate: string | null;

  @Column({ type: 'date', nullable: true })
  deadline: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

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

/** Profesiones etiquetadas (hasta 4, en el servicio). */
@Entity('forum_post_professions')
@Index(['professionId'])
export class ForumPostProfession {
  @PrimaryColumn({ type: 'uuid' })
  postId: string;

  @PrimaryColumn({ type: 'uuid' })
  professionId: string;

  @ManyToOne(() => ForumPost, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'post_id' })
  post?: Relation<ForumPost>;

  @ManyToOne(() => Profession, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'profession_id' })
  profession?: Relation<Profession>;
}

/** Fotos y video de la publicación (2 imágenes y 1 video, en el servicio). */
@Entity('forum_post_media')
@Index(['postId'])
@Check('ck_forum_post_media_position', 'position >= 0')
export class ForumPostMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  postId: string;

  @ManyToOne(() => ForumPost, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'post_id' })
  post?: Relation<ForumPost>;

  @Column({ type: 'uuid', unique: true })
  fileId: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<StoredFile>;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Respuesta del foro. Anidada: la respuesta padre es de la misma publicación (FK compuesta). */
@Entity('forum_replies')
@Unique(['id', 'postId'])
@Index(['postId'])
@Index(['parentReplyId'])
@Index(['authorId'])
@Index(['hiddenBy'])
@Check('ck_forum_replies_price', 'proposed_price IS NULL OR proposed_price > 0')
@Check('ck_forum_replies_hidden', HIDDEN_CHECK)
export class ForumReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  postId: string;

  @ManyToOne(() => ForumPost, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'post_id' })
  post?: Relation<ForumPost>;

  @Column({ type: 'uuid', nullable: true })
  parentReplyId: string | null;

  @ManyToOne(() => ForumReply, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn([
    { name: 'parent_reply_id', referencedColumnName: 'id' },
    { name: 'post_id', referencedColumnName: 'postId' },
  ])
  parent?: Relation<ForumReply>;

  @Column({ type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'author_id' })
  author?: Relation<User>;

  @Column({ type: 'varchar', length: 1000 })
  body: string;

  /** Presupuesto estimado: solo profesionales, en "Solicito profesional". */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  proposedPrice: string | null;

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

@Entity('forum_post_likes')
@Index(['userId'])
export class ForumPostLike {
  @PrimaryColumn({ type: 'uuid' })
  postId: string;

  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => ForumPost, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'post_id' })
  post?: Relation<ForumPost>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('forum_reply_likes')
@Index(['userId'])
export class ForumReplyLike {
  @PrimaryColumn({ type: 'uuid' })
  replyId: string;

  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => ForumReply, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'reply_id' })
  reply?: Relation<ForumReply>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
