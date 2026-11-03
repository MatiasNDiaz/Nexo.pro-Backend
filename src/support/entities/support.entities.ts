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

export enum SupportCategory {
  SUGGESTION = 'SUGGESTION',
  BUG = 'BUG',
  INCIDENT = 'INCIDENT',
  COMPLAINT = 'COMPLAINT',
  OTHER = 'OTHER',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  ANSWERED = 'ANSWERED',
  CLOSED = 'CLOSED',
}

/** Consulta a soporte (FI §21, ADR 0029): desde la app o desde el formulario público. */
@Entity('support_tickets')
@Index(['userId'])
@Index(['status'])
@Check('ck_support_tickets_contact', 'user_id IS NOT NULL OR contact_email IS NOT NULL')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null si llegó por el formulario público. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'citext', nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  contactName: string | null;

  @Column({ type: 'enum', enum: SupportCategory, enumName: 'support_category' })
  category: SupportCategory;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    enumName: 'ticket_status',
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('support_messages')
@Index(['ticketId'])
@Index(['authorId'])
@Check('ck_support_messages_staff', 'NOT from_staff OR author_id IS NOT NULL')
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ticketId: string;

  @ManyToOne(() => SupportTicket, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: Relation<SupportTicket>;

  /** null = autor del formulario público. */
  @Column({ type: 'uuid', nullable: true })
  authorId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'author_id' })
  author?: Relation<User>;

  @Column({ type: 'boolean', default: false })
  fromStaff: boolean;

  @Column({ type: 'varchar', length: 2000 })
  body: string;

  /** Una foto de evidencia (privada). */
  @Column({ type: 'uuid', nullable: true, unique: true })
  fileId: string | null;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<StoredFile>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Segmento de una novedad: vacío = todos los clientes y profesionales. */
export interface AnnouncementSegment {
  roles?: Array<'CUSTOMER' | 'PROFESSIONAL'>;
  professionIds?: string[];
  planCodes?: string[];
}

/** Novedad del admin (FI §21): llega como notificación a quienes cumplen el segmento. */
@Entity('announcements')
@Index(['authorId'])
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'author_id' })
  author?: Relation<User>;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 2000 })
  body: string;

  @Column({ type: 'jsonb', default: {} })
  segment: AnnouncementSegment;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
