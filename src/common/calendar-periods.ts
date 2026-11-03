/**
 * Períodos de calendario del panel de ingresos (ADR 0030) y de las métricas Premium (ADR 0033).
 * Los rangos son días de calendario en hora de Córdoba,
 * como texto `YYYY-MM-DD` con ambos extremos incluidos; la base los convierte a instantes con
 * `AT TIME ZONE`. Acá solo hay aritmética de calendario (en UTC, para no depender del huso del
 * servidor).
 */
export const CORDOBA_TIME_ZONE = 'America/Argentina/Cordoba';

export type GroupBy = 'day' | 'week' | 'month' | 'year';

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const parse = (day: string) => new Date(`${day}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number) =>
  format(new Date(parse(day).getTime() + days * DAY_MS));
const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Corre una fecha `months` meses (negativo = atrás), sin pasarse del último día del mes. */
function addMonths(day: string, months: number, toMonthEnd = false): string {
  const date = parse(day);
  const index = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = lastDayOfMonth(year, month);
  return format(
    new Date(Date.UTC(year, month, toMonthEnd ? last : Math.min(date.getUTCDate(), last))),
  );
}

/** Hoy en Córdoba. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: CORDOBA_TIME_ZONE }).format(now);
}

export const daysIn = (range: DateRange) =>
  Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / DAY_MS) + 1;

/**
 * El período anterior: el mismo tramo, corrido hacia atrás en el calendario. Si el rango arranca un
 * día 1, se corre en meses (1 al 3 de noviembre → 1 al 3 de octubre; todo 2026 → todo 2025; un mes
 * completo → el mes anterior completo). Si no, se corre en días (una semana → la anterior).
 */
export function previousRange(range: DateRange): DateRange {
  const from = parse(range.from);
  const to = parse(range.to);
  if (from.getUTCDate() === 1) {
    const months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      to.getUTCMonth() -
      from.getUTCMonth() +
      1;
    const toIsMonthEnd = to.getUTCDate() === lastDayOfMonth(to.getUTCFullYear(), to.getUTCMonth());
    return {
      from: addMonths(range.from, -months),
      to: addMonths(range.to, -months, toIsMonthEnd),
    };
  }
  const days = daysIn(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

/** Comienzo del período (día, lunes, día 1 o 1 de enero) que contiene la fecha. */
export function bucketStart(day: string, groupBy: GroupBy): string {
  const date = parse(day);
  switch (groupBy) {
    case 'day':
      return day;
    case 'week':
      // getUTCDay: 0 = domingo. Las semanas van de lunes a domingo.
      return addDays(day, -((date.getUTCDay() + 6) % 7));
    case 'month':
      return `${day.slice(0, 7)}-01`;
    case 'year':
      return `${day.slice(0, 4)}-01-01`;
  }
}

/** Todos los períodos del rango, también los que no tuvieron movimientos. */
export function bucketsOf(range: DateRange, groupBy: GroupBy): string[] {
  const buckets: string[] = [];
  let current = bucketStart(range.from, groupBy);
  while (current <= range.to) {
    buckets.push(current);
    current =
      groupBy === 'day'
        ? addDays(current, 1)
        : groupBy === 'week'
          ? addDays(current, 7)
          : addMonths(current, groupBy === 'month' ? 1 : 12);
  }
  return buckets;
}

/** Rango por defecto del resumen: el mes actual hasta hoy. */
export function currentMonthToDate(now = new Date()): DateRange {
  const day = today(now);
  return { from: `${day.slice(0, 7)}-01`, to: day };
}
