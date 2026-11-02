import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { IdentityVerification } from './identity-verification.entity';

/** Avisos (webhooks) recibidos del proveedor. Único por (provider, eventId): idempotencia. */
@Entity('identity_provider_events')
@Unique(['provider', 'eventId'])
@Index(['verificationId'])
export class IdentityProviderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ type: 'varchar', length: 200 })
  eventId: string;

  @Column({ type: 'uuid', nullable: true })
  verificationId: string | null;

  @ManyToOne(() => IdentityVerification, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'verification_id' })
  verification?: Relation<IdentityVerification>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;

  /** Null mientras no se procesó: el reintento del proveedor lo vuelve a intentar. */
  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  /** Código corto (UNKNOWN_REFERENCE, PROCESSING_FAILED). Nunca el cuerpo del aviso. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  processingError: string | null;
}
