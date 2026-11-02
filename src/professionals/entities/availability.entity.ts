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
} from 'typeorm';
import { ExceptionType } from '../professional.enums';
import { ProfessionalProfile } from './professional-profile.entity';

/** Horario semanal (hora de Córdoba). Igual para todas sus profesiones (FI §10). */
@Entity('availability_slots')
@Index(['professionalId'])
@Check('ck_availability_slots_weekday', 'weekday BETWEEN 1 AND 7')
@Check('ck_availability_slots_range', 'start_time < end_time')
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  /** 1 = lunes … 7 = domingo (ISO 8601). */
  @Column({ type: 'smallint' })
  weekday: number;

  /** `HH:MM:SS`, como lo devuelve PostgreSQL. */
  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;
}

/** Días sin atención: descanso, feriado o vacaciones (fechas de Córdoba, inclusivas). */
@Entity('availability_exceptions')
@Index(['professionalId', 'endDate'])
@Check('ck_availability_exceptions_range', 'end_date >= start_date')
export class AvailabilityException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'professional_id' })
  professional?: Relation<ProfessionalProfile>;

  /** `YYYY-MM-DD`. */
  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'enum', enum: ExceptionType, enumName: 'exception_type' })
  type: ExceptionType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
