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
import { User } from './user.entity';

/**
 * Datos del cliente que no son de identidad. La dirección exacta llega en la etapa 8 (cifrada y
 * solo visible con una contratación).
 */
@Entity('customer_profiles')
export class CustomerProfile {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  /** Datos útiles para el profesional (p. ej. "timbre roto, llamar al celular"). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  extraInfo: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
