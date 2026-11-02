import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericToNumber } from '../../database/transformers';
import { COORDINATES_CHECK, Locality } from './locality.entity';

@Entity('neighborhoods')
@Index('uq_neighborhoods_locality_id_name_lower', { synchronize: false })
@Check('ck_neighborhoods_coordinates', COORDINATES_CHECK)
export class Neighborhood {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  localityId: string;

  @ManyToOne(() => Locality, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'locality_id' })
  locality?: Locality;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: numericToNumber })
  lat: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: numericToNumber })
  lng: number | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
