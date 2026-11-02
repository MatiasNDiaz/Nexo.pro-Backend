import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { SocialNetwork } from '../professional.enums';
import { ProfessionalProfile } from './professional-profile.entity';

/** Redes sociales del profesional (FI §5.9): una por red, solo https y del dominio de esa red. */
@Entity('professional_social_links')
@Unique(['professionalId', 'network'])
@Check('ck_professional_social_links_url', "url LIKE 'https://%'")
export class ProfessionalSocialLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  @Column({ type: 'enum', enum: SocialNetwork, enumName: 'social_network' })
  network: SocialNetwork;

  @Column({ type: 'varchar', length: 300 })
  url: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
