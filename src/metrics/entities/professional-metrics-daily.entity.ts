import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { ProfessionalProfile } from '../../professionals/entities/professional-profile.entity';

/**
 * Totales de un profesional en un día de Córdoba (ADR 0033). Solo números: quién miró no se guarda.
 * Se cuentan para todos los que aparecen en el catálogo; solo los planes con métricas los ven.
 */
@Entity('professional_metrics_daily')
@Check(
  'ck_professional_metrics_daily_counts',
  'profile_viewers >= 0 AND search_appearances >= 0 AND first_place >= 0',
)
export class ProfessionalMetricsDaily {
  @PrimaryColumn({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  /** `YYYY-MM-DD` en hora de Córdoba. */
  @PrimaryColumn({ type: 'date' })
  day: string;

  /** Personas distintas que abrieron el perfil ese día. */
  @Column({ type: 'int', default: 0 })
  profileViewers: number;

  /** Personas distintas que lo vieron en una página de resultados. */
  @Column({ type: 'int', default: 0 })
  searchAppearances: number;

  /** Personas distintas que lo vieron primero en la primera página. */
  @Column({ type: 'int', default: 0 })
  firstPlace: number;
}
