import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit-logger';
import type { AuthUser } from '../../common/decorators';
import { PaymentKind, PaymentStatus } from '../../payments/entities/payment.entity';
import { fromCents, toCents } from '../../payments/subscription-ledger';
import { UserRole } from '../../users/user.enums';
import { type CsvCell, csvInteger, csvMoney, toCsv } from './csv';
import type {
  RevenueAmountsDto,
  RevenueExportDto,
  RevenueFiltersDto,
  RevenuePaymentItemDto,
  RevenuePaymentListDto,
  RevenuePaymentsQueryDto,
  RevenuePersonDto,
  RevenueRegistrationItemDto,
  RevenueRegistrationListDto,
  RevenueRegistrationsQueryDto,
  RevenueSummaryDto,
  RevenueSummaryQueryDto,
  RevenueTotalsDto,
} from './dto/revenue.dto';
import {
  bucketsOf,
  currentMonthToDate,
  type DateRange,
  daysIn,
  type GroupBy,
  previousRange,
  CORDOBA_TIME_ZONE,
  today,
} from '../../common/calendar-periods';

/** Un CSV más grande pide acotar las fechas. */
export const MAX_EXPORT_ROWS = 50_000;
const MAX_BUCKETS = 400;

/** Los que movieron plata: lo que muestra la lista de pagos si no se filtra por estado. */
const SETTLED = [PaymentStatus.APPROVED, PaymentStatus.REFUNDED, PaymentStatus.CHARGED_BACK];

/** Localidades de una persona hoy: donde vive (cliente) y donde trabaja (profesional). */
const LOCALITY_IDS = (u: string) => `(
  SELECT n.locality_id FROM neighborhoods n WHERE n.id = ${u}.neighborhood_id
  UNION
  SELECT a.locality_id FROM professional_service_areas a
    JOIN professional_profiles pp ON pp.id = a.professional_id
   WHERE pp.user_id = ${u}.id)`;
const LOCALITY_NAMES = (u: string) =>
  `ARRAY(SELECT l.name FROM localities l WHERE l.id IN ${LOCALITY_IDS(u)} ORDER BY l.name)`;
/** Tiene algún cobro que no se devolvió. */
const HAS_PAID = (u: string) => `EXISTS (
  SELECT 1 FROM payments hp
   WHERE hp.user_id = ${u}.id AND hp.approved_at IS NOT NULL AND hp.money_returned_at IS NULL)`;
const CURRENT_PLAN = (u: string, column: string) => `(
  SELECT ${column} FROM subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id
   WHERE s.user_id = ${u}.id ORDER BY s.created_at DESC LIMIT 1)`;

/** Arma el WHERE con parámetros posicionales (se pueden compartir entre varios WHERE). */
class Where {
  private readonly clauses: string[] = [];

  constructor(readonly params: unknown[] = []) {}

  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  add(clause: string): this {
    this.clauses.push(clause);
    return this;
  }

  /** Días de Córdoba, ambos incluidos. */
  range(column: string, range: Partial<DateRange>): this {
    const zone = `'${CORDOBA_TIME_ZONE}'`;
    if (range.from) {
      this.add(`${column} >= (${this.param(range.from)}::date)::timestamp AT TIME ZONE ${zone}`);
    }
    if (range.to) {
      this.add(`${column} < (${this.param(range.to)}::date + 1)::timestamp AT TIME ZONE ${zone}`);
    }
    return this;
  }

  toString(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

interface PersonRow {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  deleted_at: Date | null;
  localities: string[];
}

interface PaymentRow extends PersonRow {
  id: string;
  date: Date;
  amount: string;
  currency: string;
  status: PaymentStatus;
  kind: PaymentKind | null;
  money_returned_at: Date | null;
  plan_code: string;
  plan_name: string;
  previous_plan_code: string | null;
}

interface RegistrationRow extends PersonRow {
  created_at: Date;
  current_plan_code: string | null;
  has_paid: boolean;
}

interface MoveRow {
  bucket: string;
  plan_code: string;
  move: 'GROSS' | 'REFUNDED' | 'CHARGED_BACK';
  amount: string;
  count: string;
}

/** Sumas en centavos. */
interface Acc {
  gross: number;
  refunds: number;
  chargebacks: number;
  payments: number;
  returns: number;
}

const emptyAcc = (): Acc => ({ gross: 0, refunds: 0, chargebacks: 0, payments: 0, returns: 0 });

const amountsOf = (acc: Acc): RevenueAmountsDto => ({
  gross: fromCents(acc.gross),
  refunds: fromCents(acc.refunds),
  chargebacks: fromCents(acc.chargebacks),
  net: fromCents(acc.gross - acc.refunds - acc.chargebacks),
  payments: acc.payments,
  returns: acc.returns,
});

const netOf = (acc: Acc) => acc.gross - acc.refunds - acc.chargebacks;

const KIND_LABELS: Record<PaymentKind, string> = {
  NEW: 'Nuevo',
  RENEWAL: 'Renovación',
  REACTIVATION: 'Reactivación',
  UPGRADE: 'Mejora de plan',
};
const STATUS_LABELS: Record<PaymentStatus, string> = {
  CREATED: 'Creado',
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
  CHARGED_BACK: 'Contracargo',
};
const ROLE_LABELS: Record<string, string> = { CUSTOMER: 'Cliente', PROFESSIONAL: 'Profesional' };

const dateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: CORDOBA_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});
const localDateTime = (date: Date | null) => (date ? dateTime.format(date) : null);

/**
 * Panel de ingresos del admin (ADR 0030): pagos, registros y resumen de lo cobrado, neto de
 * reembolsos y contracargos con criterio de caja (el cobro suma en la fecha de aprobación y la
 * devolución resta en la suya). Todo en hora de Córdoba. Solo lectura, salvo la auditoría de cada
 * exportación.
 */
@Injectable()
export class RevenueService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async payments(query: RevenuePaymentsQueryDto): Promise<RevenuePaymentListDto> {
    const { rows, total } = await this.paymentRows(
      query,
      query.limit,
      (query.page - 1) * query.limit,
    );
    return { data: rows.map(paymentItem), page: query.page, limit: query.limit, total };
  }

  async registrations(query: RevenueRegistrationsQueryDto): Promise<RevenueRegistrationListDto> {
    const { rows, total } = await this.registrationRows(
      query,
      query.limit,
      (query.page - 1) * query.limit,
    );
    return { data: rows.map(registrationItem), page: query.page, limit: query.limit, total };
  }

  async summary(query: RevenueSummaryQueryDto, now = new Date()): Promise<RevenueSummaryDto> {
    const defaults = currentMonthToDate(now);
    const range = checkRange({
      from: query.from ?? (query.to ? `${query.to.slice(0, 7)}-01` : defaults.from),
      to: query.to ?? today(now),
    });
    const buckets = bucketsOf(range, query.groupBy);
    if (buckets.length > MAX_BUCKETS) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LONG',
        message: `Son más de ${MAX_BUCKETS} períodos: agrupá por semana, mes o año, o acortá las fechas.`,
      });
    }
    const previous = previousRange(range);
    const current = await this.moves(query, range, query.groupBy);
    const before = await this.moves(query, previous, query.groupBy);

    const total = totals(current);
    const previousTotal = totals(before);
    const net = netOf(total.acc);
    const previousNet = netOf(previousTotal.acc);
    return {
      from: range.from,
      to: range.to,
      groupBy: query.groupBy,
      currency: 'ARS',
      buckets: buckets.map((start) => ({
        start,
        ...totals(current.filter((r) => r.bucket === start)).dto,
      })),
      total: total.dto,
      previous: { from: previous.from, to: previous.to, ...previousTotal.dto },
      change: {
        net: fromCents(net - previousNet),
        netPercent:
          previousNet === 0
            ? null
            : Math.round(((net - previousNet) / Math.abs(previousNet)) * 1000) / 10,
      },
      localityMayOverlap: query.localityId !== undefined,
    };
  }

  /** CSV con los mismos filtros que la pantalla. Cada exportación queda auditada. */
  async export(
    admin: AuthUser,
    dto: RevenueExportDto,
    ipHash: string | null,
  ): Promise<{ filename: string; content: Buffer }> {
    let header: string[];
    let rows: CsvCell[][];
    switch (dto.report) {
      case 'PAYMENTS': {
        const result = await this.paymentRows(dto, MAX_EXPORT_ROWS + 1, 0);
        header = [
          'Fecha y hora',
          'Nombre',
          'Email',
          'Rol',
          'Localidades',
          'Plan',
          'Plan anterior',
          'Tipo',
          'Estado',
          'Monto',
          'Moneda',
          'Fecha de devolución',
          'Id del pago',
        ];
        rows = result.rows.map((r) => {
          const p = paymentItem(r);
          return [
            localDateTime(p.date),
            p.user.name,
            p.user.email,
            ROLE_LABELS[p.user.role] ?? p.user.role,
            p.user.localities.join(', '),
            p.planName,
            p.previousPlanCode,
            p.kind ? KIND_LABELS[p.kind] : 'Sin aplicar',
            STATUS_LABELS[p.status],
            csvMoney(toCents(p.amount)),
            p.currency,
            localDateTime(p.moneyReturnedAt),
            p.id,
          ];
        });
        break;
      }
      case 'REGISTRATIONS': {
        const result = await this.registrationRows(dto, MAX_EXPORT_ROWS + 1, 0);
        // Sin email (ADR 0030): la descarga de datos de clientes se limita a lo necesario.
        header = [
          'Fecha y hora de registro',
          'Nombre',
          'Rol',
          'Localidades',
          'Plan actual',
          'Pagó alguna vez',
          'Cuenta eliminada',
        ];
        rows = result.rows.map((r) => {
          const item = registrationItem(r);
          return [
            localDateTime(item.registeredAt),
            item.user.name,
            ROLE_LABELS[item.user.role] ?? item.user.role,
            item.user.localities.join(', '),
            item.currentPlanCode,
            item.hasPaid === null ? null : item.hasPaid ? 'Sí' : 'No',
            item.user.deleted ? 'Sí' : 'No',
          ];
        });
        break;
      }
      case 'SUMMARY': {
        const summary = await this.summary(dto);
        header = ['Período', 'Plan', 'Cobrado', 'Reembolsos', 'Contracargos', 'Neto', 'Cobros'];
        const line = (label: string, plan: string, a: RevenueAmountsDto): CsvCell[] => [
          label,
          plan,
          csvMoney(toCents(a.gross)),
          csvMoney(toCents(a.refunds)),
          csvMoney(toCents(a.chargebacks)),
          csvMoney(toCents(a.net)),
          csvInteger(a.payments),
        ];
        const withPlans = (label: string, t: RevenueTotalsDto) => [
          line(label, 'Todos', t),
          ...t.byPlan.map((p) => line(label, p.planCode, p)),
        ];
        rows = [
          ...summary.buckets.flatMap((b) => withPlans(b.start, b)),
          ...withPlans(`Total ${summary.from} a ${summary.to}`, summary.total),
          ...withPlans(
            `Período anterior ${summary.previous.from} a ${summary.previous.to}`,
            summary.previous,
          ),
          [
            'Variación del neto',
            'Todos',
            null,
            null,
            null,
            csvMoney(toCents(summary.change.net)),
            summary.change.netPercent === null
              ? null
              : { number: `${String(summary.change.netPercent).replace('.', ',')} %` },
          ],
        ];
        break;
      }
    }
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new UnprocessableEntityException({
        code: 'EXPORT_TOO_LARGE',
        message: `Son más de ${MAX_EXPORT_ROWS} filas: acotá las fechas.`,
      });
    }

    await this.audit.record({
      actorId: admin.id,
      action: 'REVENUE_EXPORTED',
      targetType: 'REVENUE',
      targetId: null,
      reason: null,
      result: 'SUCCESS',
      ipHash,
      // Solo el reporte, los filtros (ids y fechas) y la cantidad de filas: ningún dato personal.
      metadata: {
        report: dto.report,
        from: dto.from ?? null,
        to: dto.to ?? null,
        planId: dto.planId ?? null,
        localityId: dto.localityId ?? null,
        status: dto.status ?? null,
        kind: dto.kind ?? null,
        role: dto.role ?? null,
        hasPaid: dto.hasPaid ?? null,
        groupBy: dto.report === 'SUMMARY' ? dto.groupBy : null,
        rows: rows.length,
      },
    });
    const names = { PAYMENTS: 'pagos', REGISTRATIONS: 'registros', SUMMARY: 'resumen-ingresos' };
    return { filename: `${names[dto.report]}-${today()}.csv`, content: toCsv(header, rows) };
  }

  // ---------------------------------------------------------------------------------------------

  private async paymentRows(
    query: RevenueFiltersDto & { status?: PaymentStatus; kind?: PaymentKind },
    limit: number,
    offset: number,
  ): Promise<{ rows: PaymentRow[]; total: number }> {
    const range = checkRange(query);
    const statuses = query.status ? [query.status] : SETTLED;
    // Los que se aprobaron van por fecha de aprobación; los demás, por la de creación.
    const dateColumn = SETTLED.includes(statuses[0]) ? 'p.approved_at' : 'p.created_at';
    const where = new Where();
    where.add(`p.status = ANY(${where.param(statuses)}::payment_status[])`);
    where.range(dateColumn, range);
    if (query.planId) where.add(`p.plan_id = ${where.param(query.planId)}`);
    if (query.kind) where.add(`p.kind = ${where.param(query.kind)}`);
    if (query.localityId) {
      where.add(`${where.param(query.localityId)}::uuid IN ${LOCALITY_IDS('u')}`);
    }
    const from = `FROM payments p JOIN users u ON u.id = p.user_id ${where.toString()}`;
    const [{ count }] = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT count(*) AS count ${from}`,
      where.params,
    );
    const rows = await this.dataSource.query<PaymentRow[]>(
      `SELECT p.id, ${dateColumn} AS date, p.amount, p.currency, p.status, p.kind,
              p.money_returned_at, sp.code AS plan_code, sp.name AS plan_name,
              prev.code AS previous_plan_code,
              u.id AS user_id, u.first_name, u.last_name, u.email, u.role, u.deleted_at,
              ${LOCALITY_NAMES('u')} AS localities
         FROM payments p
         JOIN users u ON u.id = p.user_id
         JOIN subscription_plans sp ON sp.id = p.plan_id
         LEFT JOIN subscription_plans prev ON prev.id = p.previous_plan_id
         ${where.toString()}
        ORDER BY date DESC, p.id
        LIMIT ${where.param(limit)} OFFSET ${where.param(offset)}`,
      where.params,
    );
    return { rows, total: Number(count) };
  }

  private async registrationRows(
    query: RevenueFiltersDto & { role?: UserRole; hasPaid?: boolean },
    limit: number,
    offset: number,
  ): Promise<{ rows: RegistrationRow[]; total: number }> {
    const range = checkRange(query);
    const where = new Where();
    where.add(`u.role <> 'ADMIN'`);
    where.range('u.created_at', range);
    if (query.role) where.add(`u.role = ${where.param(query.role)}`);
    if (query.planId) {
      where.add(`${CURRENT_PLAN('u', 's.plan_id')} = ${where.param(query.planId)}::uuid`);
    }
    if (query.localityId) {
      where.add(`${where.param(query.localityId)}::uuid IN ${LOCALITY_IDS('u')}`);
    }
    if (query.hasPaid !== undefined) {
      where.add(`${HAS_PAID('u')} = ${where.param(query.hasPaid)}`);
    }
    const [{ count }] = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT count(*) AS count FROM users u ${where.toString()}`,
      where.params,
    );
    const rows = await this.dataSource.query<RegistrationRow[]>(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.email, u.role, u.deleted_at,
              u.created_at, ${LOCALITY_NAMES('u')} AS localities,
              ${CURRENT_PLAN('u', 'sp.code')} AS current_plan_code,
              ${HAS_PAID('u')} AS has_paid
         FROM users u
         ${where.toString()}
        ORDER BY u.created_at DESC, u.id
        LIMIT ${where.param(limit)} OFFSET ${where.param(offset)}`,
      where.params,
    );
    return { rows, total: Number(count) };
  }

  /** Cobros (por fecha de aprobación) y devoluciones (por fecha de devolución), por período y plan. */
  private moves(
    filters: RevenueFiltersDto,
    range: DateRange,
    groupBy: GroupBy,
  ): Promise<MoveRow[]> {
    const params: unknown[] = [];
    const unit = new Where(params).param(groupBy);
    const filtersFor = (column: string) => {
      const where = new Where(params).add(`${column} IS NOT NULL`).range(column, range);
      if (filters.planId) where.add(`p.plan_id = ${where.param(filters.planId)}`);
      if (filters.localityId) {
        where.add(`${where.param(filters.localityId)}::uuid IN ${LOCALITY_IDS('u')}`);
      }
      return where.toString();
    };
    return this.dataSource.query<MoveRow[]>(
      `WITH moves AS (
         SELECT p.plan_id, p.amount, p.approved_at AS at, 'GROSS' AS move
           FROM payments p JOIN users u ON u.id = p.user_id
           ${filtersFor('p.approved_at')}
         UNION ALL
         SELECT p.plan_id, p.amount, p.money_returned_at, p.status::text
           FROM payments p JOIN users u ON u.id = p.user_id
           ${filtersFor('p.money_returned_at')})
       SELECT to_char(date_trunc(${unit}, m.at AT TIME ZONE '${CORDOBA_TIME_ZONE}'), 'YYYY-MM-DD')
                AS bucket,
              sp.code AS plan_code, m.move, sum(m.amount)::text AS amount, count(*) AS count
         FROM moves m JOIN subscription_plans sp ON sp.id = m.plan_id
        GROUP BY 1, 2, 3`,
      params,
    );
  }
}

// ---- Funciones auxiliares ----------------------------------------------------------------------

function checkRange<T extends Partial<DateRange>>(range: T): T {
  if (range.from && range.to && range.from > range.to) {
    throw new BadRequestException({
      code: 'INVALID_RANGE',
      message: 'La fecha "desde" tiene que ser anterior o igual a "hasta".',
    });
  }
  if (range.from && range.to && daysIn(range as DateRange) > 366 * 50) {
    throw new BadRequestException({
      code: 'RANGE_TOO_LONG',
      message: 'El rango es demasiado largo.',
    });
  }
  return range;
}

/** Suma las filas en centavos, en total y por plan. */
function totals(rows: MoveRow[]): { acc: Acc; dto: RevenueTotalsDto } {
  const acc = emptyAcc();
  const byPlan = new Map<string, Acc>();
  for (const row of rows) {
    const cents = toCents(row.amount);
    const count = Number(row.count);
    const plan = byPlan.get(row.plan_code) ?? emptyAcc();
    byPlan.set(row.plan_code, plan);
    for (const target of [acc, plan]) {
      if (row.move === 'GROSS') {
        target.gross += cents;
        target.payments += count;
      } else {
        if (row.move === 'REFUNDED') target.refunds += cents;
        else target.chargebacks += cents;
        target.returns += count;
      }
    }
  }
  return {
    acc,
    dto: {
      ...amountsOf(acc),
      byPlan: [...byPlan.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([planCode, plan]) => ({ planCode, ...amountsOf(plan) })),
    },
  };
}

function person(row: PersonRow): RevenuePersonDto {
  const deleted = row.deleted_at !== null;
  return {
    id: row.user_id,
    name: deleted ? 'Usuario eliminado' : `${row.first_name} ${row.last_name}`,
    email: deleted ? null : row.email,
    role: row.role,
    deleted,
    localities: row.localities,
  };
}

function paymentItem(row: PaymentRow): RevenuePaymentItemDto {
  return {
    id: row.id,
    date: row.date,
    user: person(row),
    planCode: row.plan_code,
    planName: row.plan_name,
    previousPlanCode: row.previous_plan_code,
    kind: row.kind,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    moneyReturnedAt: row.money_returned_at,
  };
}

function registrationItem(row: RegistrationRow): RevenueRegistrationItemDto {
  return {
    user: person(row),
    registeredAt: row.created_at,
    currentPlanCode: row.current_plan_code,
    // Los clientes no pagan planes: vacío salvo que hayan pagado como profesionales.
    hasPaid: row.has_paid ? true : row.role === UserRole.CUSTOMER ? null : false,
  };
}
