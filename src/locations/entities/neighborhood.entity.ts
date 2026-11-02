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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { numericToNumber } from '../../database/transformers';
import { User } from '../../users/entities/user.entity';
import { COORDINATES_CHECK, Locality } from './locality.entity';

export enum NeighborhoodStatus {
  /** Cargado por un usuario: se puede usar, pero no aparece en filtros ni autocompletado públicos. */
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  /** Fusionado con otro: queda como alias de `mergedIntoId` (ADR 0010). */
  MERGED = 'MERGED',
}

/** Barrios creados por los usuarios y moderados por el admin (ADR 0010). */
@Entity('neighborhoods')
// Un nombre normalizado por localidad, incluidos los alias fusionados.
@Unique('uq_neighborhoods_locality_id_normalized_name', ['localityId', 'normalizedName'])
// Destino de las FK compuestas (barrio, localidad): garantiza que el barrio sea de esa localidad.
@Unique('uq_neighborhoods_id_locality_id', ['id', 'localityId'])
@Index(['mergedIntoId'])
@Index(['createdByUserId'])
@Index(['reviewedById'])
@Check('ck_neighborhoods_coordinates', COORDINATES_CHECK)
@Check(
  'ck_neighborhoods_merge',
  "(status = 'MERGED') = (merged_into_id IS NOT NULL) AND merged_into_id <> id",
)
export class Neighborhood {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  localityId: string;

  @ManyToOne(() => Locality, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'locality_id' })
  locality?: Relation<Locality>;

  /** Nombre que se muestra. */
  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Solo para comparar: minúsculas, sin tildes ni puntuación, espacios simples. */
  @Column({ type: 'varchar', length: 120 })
  normalizedName: string;

  @Column({
    type: 'enum',
    enum: NeighborhoodStatus,
    enumName: 'neighborhood_status',
    default: NeighborhoodStatus.PENDING,
  })
  status: NeighborhoodStatus;

  @Column({ type: 'uuid', nullable: true })
  mergedIntoId: string | null;

  @ManyToOne(() => Neighborhood, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'merged_into_id' })
  mergedInto?: Relation<Neighborhood>;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy?: Relation<User>;

  @Column({ type: 'uuid', nullable: true })
  reviewedById: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy?: Relation<User>;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: numericToNumber })
  lat: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: numericToNumber })
  lng: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
