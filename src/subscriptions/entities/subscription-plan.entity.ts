import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ThemeLevel {
  /** Plantilla predeterminada (Basic). */
  NONE = 'NONE',
  /** Colores, gradientes, tipografías, banner con imagen y textos (Medium). */
  STANDARD = 'STANDARD',
  /** Lo anterior más efectos, animaciones y banner con video (Premium). */
  EXTENDED = 'EXTENDED',
}

/**
 * Precios y límites de cada plan. Es la ÚNICA fuente: el código nunca repite estos valores.
 * Los edita el admin (con auditoría, etapa 7). Los cobros guardan su propio snapshot del importe.
 */
@Entity('subscription_plans')
@Check('ck_subscription_plans_price', 'price_amount >= 0')
@Check('ck_subscription_plans_currency', "currency ~ '^[A-Z]{3}$'")
@Check(
  'ck_subscription_plans_limits',
  'max_professions >= 1 AND max_images >= 0 AND max_videos >= 0 AND max_video_seconds > 0 AND ranking_tier >= 0',
)
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  /** `numeric(12,2)`: se mantiene como string para no perder precisión. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  priceAmount: string;

  @Column({ type: 'char', length: 3, default: 'ARS' })
  currency: string;

  @Column({ type: 'smallint' })
  maxProfessions: number;

  @Column({ type: 'smallint' })
  maxImages: number;

  @Column({ type: 'smallint' })
  maxVideos: number;

  @Column({ type: 'smallint' })
  maxVideoSeconds: number;

  @Column({ type: 'enum', enum: ThemeLevel, enumName: 'theme_level' })
  themeLevel: ThemeLevel;

  /** Mayor = mejor posición en el catálogo. Pesos del ranking: pendiente P-10. */
  @Column({ type: 'smallint' })
  rankingTier: number;

  @Column({ type: 'boolean' })
  availabilityAlerts: boolean;

  @Column({ type: 'boolean' })
  customAlertMessage: boolean;

  @Column({ type: 'boolean' })
  metricsEnabled: boolean;

  @Column({ type: 'boolean' })
  chatbotEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
