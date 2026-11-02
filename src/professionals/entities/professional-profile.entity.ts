import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Perfil profesional. Por ahora mínimo (ADR 0006): existe para colgar profesiones y zonas del
 * registro. Los datos del perfil público (bio, tarifas, medios, tema) llegan en la etapa 7.
 */
@Entity('professional_profiles')
export class ProfessionalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Único: un perfil por usuario (ManyToOne + unique evita el constraint extra de @OneToOne). */
  @Column({ type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  /** Perfil inactivo: el usuario cambió de rol (ADR 0012) o dio de baja la cuenta. No se borra. */
  @Column({ type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
