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
import { Province } from './province.entity';

export const COORDINATES_CHECK =
  '(lat IS NULL) = (lng IS NULL) AND (lat IS NULL OR lat BETWEEN -90 AND 90) AND (lng IS NULL OR lng BETWEEN -180 AND 180)';

@Entity('localities')
@Index('uq_localities_province_id_name_lower', { synchronize: false })
@Check('ck_localities_coordinates', COORDINATES_CHECK)
export class Locality {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  provinceId: string;

  @ManyToOne(() => Province, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'province_id' })
  province?: Province;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Centroide aproximado. Pendiente: no hay fuente oficial de coordenadas (docs/decisions/pendientes.md). */
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
