import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Registro idempotente de webhooks del proveedor de identidad. */
@Entity({ name: 'identity_provider_events' })
@Index('uq_identity_provider_events_event', ['provider', 'eventId'], { unique: true })
export class IdentityProviderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ name: 'event_id', type: 'varchar', length: 200 })
  eventId: string;

  @Column({ name: 'verification_id', type: 'uuid', nullable: true })
  verificationId: string | null;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'processing_error', type: 'varchar', length: 200, nullable: true })
  processingError: string | null;
}
