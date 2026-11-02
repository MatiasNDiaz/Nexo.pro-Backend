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
import { User } from '../../users/entities/user.entity';
import {
  FileKind,
  FilePurpose,
  FileStatus,
  FileVisibility,
  StorageProviderCode,
} from '../file.enums';

/** `bigint` llega del driver como string; los pesos entran holgados en un double. */
const bigintToNumber = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * Metadatos de un archivo (ADR 0018). El binario vive en el proveedor; acá solo lo que la API
 * verificó al confirmar la subida. Nunca se confía en el tipo o el peso que declara el navegador.
 */
@Entity('stored_files')
@Index(['ownerUserId'])
// Parcial (solo pendientes): creado en la migración.
@Index('ix_stored_files_pending', { synchronize: false })
@Check('ck_stored_files_provider', "provider IN ('CLOUDINARY', 'LOCAL')")
@Check(
  'ck_stored_files_metadata',
  '(size_bytes IS NULL OR size_bytes >= 0) AND (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 15500)',
)
@Check(
  'ck_stored_files_ready',
  "status <> 'READY' OR (mime_type IS NOT NULL AND size_bytes IS NOT NULL)",
)
export class StoredFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'owner_user_id' })
  owner?: Relation<User>;

  @Column({ type: 'varchar', length: 20 })
  provider: StorageProviderCode;

  /** Clave en el proveedor (public_id de Cloudinary o ruta relativa en disco). */
  @Column({ type: 'varchar', length: 200, unique: true })
  storageKey: string;

  @Column({ type: 'enum', enum: FilePurpose, enumName: 'file_purpose' })
  purpose: FilePurpose;

  @Column({ type: 'enum', enum: FileKind, enumName: 'file_kind' })
  kind: FileKind;

  @Column({ type: 'enum', enum: FileVisibility, enumName: 'file_visibility' })
  visibility: FileVisibility;

  @Column({
    type: 'enum',
    enum: FileStatus,
    enumName: 'file_status',
    default: FileStatus.PENDING_UPLOAD,
  })
  status: FileStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mimeType: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintToNumber })
  sizeBytes: number | null;

  /** Solo videos (máximo 15 s; la constraint deja 0,5 s de margen por redondeo del contenedor). */
  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
