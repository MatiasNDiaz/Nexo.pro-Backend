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
import { MediaPurpose, MediaStatus } from '../professional.enums';
import { ProfessionalProfile } from './professional-profile.entity';

/**
 * Imágenes y videos del perfil (FI §6.3). Cantidades y pesos según el plan, validados en el
 * servicio. El admin puede ocultarlos con motivo; no hay aprobación previa (FI §6.3).
 */
@Entity('professional_media')
@Index(['professionalId'])
@Index(['hiddenBy'])
@Check('ck_professional_media_position', 'position >= 0')
@Check(
  'ck_professional_media_hidden',
  "status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL)",
)
export class ProfessionalMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  @Column({ type: 'uuid', unique: true })
  fileId: string;

  @ManyToOne(() => StoredFile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<StoredFile>;

  @Column({ type: 'enum', enum: MediaPurpose, enumName: 'media_purpose' })
  purpose: MediaPurpose;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @Column({
    type: 'enum',
    enum: MediaStatus,
    enumName: 'media_status',
    default: MediaStatus.ACTIVE,
  })
  status: MediaStatus;

  @Column({ type: 'uuid', nullable: true })
  hiddenBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'hidden_by' })
  hider?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  hiddenReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
