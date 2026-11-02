import { AttentionStatus } from './professional.enums';

export const ATTENTION_TIME_ZONE = 'America/Argentina/Cordoba';

export interface AttentionInput {
  attentionStatus: AttentionStatus;
  attentionStatusUntil: Date | null;
  autoStatusFromSchedule: boolean;
  /** Horario semanal: 1 = lunes … 7 = domingo; horas `HH:MM` o `HH:MM:SS`. */
  slots: ReadonlyArray<{ weekday: number; startTime: string; endTime: string }>;
  /** Días sin atención (`YYYY-MM-DD`, inclusivos). */
  exceptions: ReadonlyArray<{ startDate: string; endDate: string }>;
}

/** Fecha, día de la semana y hora en Córdoba. */
export function cordobaClock(now: Date): { date: string; weekday: number; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ATTENTION_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays.indexOf(parts.weekday ?? '') + 1,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

const withSeconds = (time: string) => (time.length === 5 ? `${time}:00` : time);

/**
 * Estado que se muestra (FI §10), calculado al leerlo, sin tareas programadas:
 * - Estado manual: vale hasta `attentionStatusUntil`; vencido, el profesional queda "Descansando".
 * - Con horario automático: un estado manual con vencimiento futuro manda (excepción puntual); si
 *   no, hoy es día sin atención → Descansando; dentro de una franja → Disponible; fuera → Descansando.
 */
export function effectiveAttentionStatus(input: AttentionInput, now = new Date()): AttentionStatus {
  const manualValid = !input.attentionStatusUntil || input.attentionStatusUntil > now;
  if (!input.autoStatusFromSchedule) {
    return manualValid ? input.attentionStatus : AttentionStatus.RESTING;
  }
  if (input.attentionStatusUntil && input.attentionStatusUntil > now) return input.attentionStatus;

  const clock = cordobaClock(now);
  const dayOff = input.exceptions.some((e) => e.startDate <= clock.date && clock.date <= e.endDate);
  if (dayOff) return AttentionStatus.RESTING;
  const inSlot = input.slots.some(
    (slot) =>
      slot.weekday === clock.weekday &&
      withSeconds(slot.startTime) <= clock.time &&
      clock.time < withSeconds(slot.endTime),
  );
  return inSlot ? AttentionStatus.AVAILABLE : AttentionStatus.RESTING;
}
