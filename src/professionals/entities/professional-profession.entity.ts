import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Profession } from '../../professions/entities/profession.entity';
import { ProItemStatus } from '../professional.enums';
import { ProfessionalProfile } from './professional-profile.entity';

/** Oficios que ofrece un profesional. Cuántos puede tener lo define su plan. */
@Entity('professional_professions')
// Una sola profesión principal por profesional: índice parcial creado en la migración.
@Index('uq_professional_professions_primary', { synchronize: false })
@Index(['professionId'])
export class ProfessionalProfession {
  @PrimaryColumn({ type: 'uuid' })
  professionalId: string;

  @PrimaryColumn({ type: 'uuid' })
  professionId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  @ManyToOne(() => Profession, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'profession_id' })
  profession?: Relation<Profession>;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({
    type: 'enum',
    enum: ProItemStatus,
    enumName: 'pro_item_status',
    default: ProItemStatus.ACTIVE,
  })
  status: ProItemStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
