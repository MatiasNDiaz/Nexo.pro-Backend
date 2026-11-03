import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** Profesional guardado por un cliente, con aviso de disponibilidad opcional (ADR 0028). */
@Entity('favorites')
@Index(['professionalId'])
@Check('ck_favorites_not_self', 'customer_id <> professional_id')
export class Favorite {
  @PrimaryColumn({ type: 'uuid' })
  customerId: string;

  @PrimaryColumn({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer?: Relation<User>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<User>;

  /** Se avisa solo si el plan del profesional incluye los avisos (Medium y Premium). */
  @Column({ type: 'boolean', default: false })
  availabilityAlerts: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
