import {
  Check,
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
import { AttentionStatus, RateMode } from '../professional.enums';
import type { ProfileTheme } from '../profile-theme';

/**
 * Perfil profesional (FI §7). Nombre, email, teléfono y foto viven en `users`. Si aparece en el
 * catálogo se calcula en cada consulta (etapa 7.3), no se guarda.
 */
@Entity('professional_profiles')
@Check('ck_professional_profiles_slug', "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
@Check(
  'ck_professional_profiles_years_experience',
  'years_experience IS NULL OR years_experience BETWEEN 0 AND 70',
)
@Check(
  'ck_professional_profiles_rate',
  '(reference_rate IS NULL) = (rate_mode IS NULL) AND (reference_rate IS NULL OR reference_rate >= 0)',
)
export class ProfessionalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Único: un perfil por usuario (ManyToOne + unique evita el constraint extra de @OneToOne). */
  @Column({ type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  /** URL pública para compartir el perfil. */
  @Column({ type: 'varchar', length: 80, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  businessName: string | null;

  /** Descripción, hasta 200 caracteres (FI §7.1). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  bio: string | null;

  @Column({ type: 'smallint', nullable: true })
  yearsExperience: number | null;

  @Column({ type: 'boolean', default: false })
  worksWithTeam: boolean;

  @Column({ type: 'boolean', default: false })
  hasMobility: boolean;

  /** Tarifa de referencia: `numeric(12,2)` como string para no perder precisión. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  referenceRate: string | null;

  @Column({ type: 'enum', enum: RateMode, enumName: 'rate_mode', nullable: true })
  rateMode: RateMode | null;

  @Column({ type: 'boolean', default: false })
  freeQuote: boolean;

  /** Estado elegido a mano. El que se muestra puede depender del horario. */
  @Column({
    type: 'enum',
    enum: AttentionStatus,
    enumName: 'attention_status',
    default: AttentionStatus.RESTING,
  })
  attentionStatus: AttentionStatus;

  /** Hasta cuándo vale el estado manual (vencimiento de "Disponible", FI §10). */
  @Column({ type: 'timestamptz', nullable: true })
  attentionStatusUntil: Date | null;

  @Column({ type: 'boolean', default: false })
  autoStatusFromSchedule: boolean;

  /** Personalización: solo valores de listas cerradas, validados contra el plan. */
  @Column({ type: 'jsonb', default: {} })
  theme: ProfileTheme;

  /** Perfil inactivo: el usuario cambió de rol (ADR 0012) o dio de baja la cuenta. No se borra. */
  @Column({ type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
