import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Locality } from '../../locations/entities/locality.entity';
import { Neighborhood } from '../../locations/entities/neighborhood.entity';
import { ProfessionalProfile } from './professional-profile.entity';

/**
 * Dónde trabaja un profesional (ADR 0010): un barrio, o toda la localidad si `neighborhoodId` es
 * null. Entre 1 y MAX_SERVICE_AREAS zonas, validado en el servicio.
 */
@Entity('professional_service_areas')
// Sin repetir zonas; "toda la localidad" (NULL) también cuenta: índice NULLS NOT DISTINCT en la migración.
@Index('uq_professional_service_areas_zone', { synchronize: false })
@Index(['localityId'])
@Index(['neighborhoodId'])
export class ProfessionalServiceArea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  @Column({ type: 'uuid' })
  localityId: string;

  @ManyToOne(() => Locality, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'locality_id' })
  locality?: Relation<Locality>;

  @Column({ type: 'uuid', nullable: true })
  neighborhoodId: string | null;

  /** FK compuesta: el barrio tiene que pertenecer a la misma localidad. */
  @ManyToOne(() => Neighborhood, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn([
    { name: 'neighborhood_id', referencedColumnName: 'id' },
    { name: 'locality_id', referencedColumnName: 'localityId' },
  ])
  neighborhood?: Relation<Neighborhood>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
