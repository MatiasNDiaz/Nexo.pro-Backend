import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  bucketsOf,
  CORDOBA_TIME_ZONE,
  currentMonthToDate,
  type DateRange,
  previousRange,
  today,
} from '../common/calendar-periods';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type {
  MetricsGroupBy,
  MetricsQueryDto,
  MetricsValuesDto,
  ProfessionalMetricsDto,
} from './dto/metrics.dto';
import { MetricsCollector } from './metrics-collector.service';

const MAX_BUCKETS = 400;
const ZONE = `'${CORDOBA_TIME_ZONE}'`;

interface Row {
  bucket: string;
  profile_viewers: string;
  search_appearances: string;
  first_place: string;
  requests: string;
  completed: string;
  rating_count: string;
  rating_sum: string;
}

type Sums = Record<
  | 'profileViewers'
  | 'searchAppearances'
  | 'firstPlace'
  | 'requests'
  | 'completed'
  | 'ratingCount'
  | 'ratingSum',
  number
>;

const empty = (): Sums => ({
  profileViewers: 0,
  searchAppearances: 0,
  firstPlace: 0,
  requests: 0,
  completed: 0,
  ratingCount: 0,
  ratingSum: 0,
});

const toValues = (s: Sums): MetricsValuesDto => ({
  profileViewers: s.profileViewers,
  searchAppearances: s.searchAppearances,
  firstPlace: s.firstPlace,
  requests: s.requests,
  completed: s.completed,
  ratingCount: s.ratingCount,
  ratingAverage: s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : null,
});

/**
 * Métricas del profesional (ADR 0033): visitas y búsquedas (`professional_metrics_daily`) más
 * pedidos, trabajos terminados y reseñas, que salen de sus tablas. Por día, semana o mes en hora de
 * Córdoba, con el período anterior. Las ven los planes con métricas (hoy, Premium) y el admin.
 */
@Injectable()
export class MetricsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly subscriptions: SubscriptionsService,
    private readonly collector: MetricsCollector,
  ) {}

  /** Las del propio profesional: solo con un plan vigente que las incluya. */
  async mine(userId: string, query: MetricsQueryDto): Promise<ProfessionalMetricsDto> {
    const plan = await this.subscriptions.livePlan(userId);
    if (!plan?.metricsEnabled) {
      throw new ForbiddenException({
        code: 'PLAN_FEATURE_REQUIRED',
        message: 'Las métricas están incluidas en el plan Premium.',
      });
    }
    return this.forUser(userId, query);
  }

  /** Para el admin (solo lectura) o el propio profesional ya autorizado. */
  async forUser(
    userId: string,
    query: MetricsQueryDto,
    now = new Date(),
  ): Promise<ProfessionalMetricsDto> {
    const [profile] = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM professional_profiles WHERE user_id = $1`,
      [userId],
    );
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'La cuenta no tiene perfil profesional.',
      });
    }
    const defaults = currentMonthToDate(now);
    const range: DateRange = {
      from: query.from ?? (query.to ? `${query.to.slice(0, 7)}-01` : defaults.from),
      to: query.to ?? today(now),
    };
    if (range.from > range.to) {
      throw new BadRequestException({
        code: 'INVALID_RANGE',
        message: 'La fecha "desde" tiene que ser anterior o igual a "hasta".',
      });
    }
    const buckets = bucketsOf(range, query.groupBy);
    if (buckets.length > MAX_BUCKETS) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LONG',
        message: `Son más de ${MAX_BUCKETS} períodos: agrupá por semana o mes, o acortá las fechas.`,
      });
    }
    // Lo contado en el último minuto todavía está en memoria.
    await this.collector.flush();
    const previous = previousRange(range);
    const current = await this.rows(profile.id, userId, range, query.groupBy);
    const before = await this.rows(profile.id, userId, previous, query.groupBy);
    const sum = (rows: Row[]) =>
      rows.reduce((acc, r) => {
        acc.profileViewers += Number(r.profile_viewers);
        acc.searchAppearances += Number(r.search_appearances);
        acc.firstPlace += Number(r.first_place);
        acc.requests += Number(r.requests);
        acc.completed += Number(r.completed);
        acc.ratingCount += Number(r.rating_count);
        acc.ratingSum += Number(r.rating_sum);
        return acc;
      }, empty());
    const [overall] = await this.dataSource.query<Array<{ count: string; average: string | null }>>(
      `SELECT count(*) AS count, round(avg(rating), 1) AS average FROM reviews
        WHERE professional_id = $1 AND status = 'VISIBLE' AND deleted_at IS NULL`,
      [userId],
    );
    return {
      from: range.from,
      to: range.to,
      groupBy: query.groupBy,
      buckets: buckets.map((start) => ({
        start,
        ...toValues(sum(current.filter((r) => r.bucket === start))),
      })),
      total: toValues(sum(current)),
      previous: { from: previous.from, to: previous.to, ...toValues(sum(before)) },
      overallRating: {
        count: Number(overall.count),
        average: overall.average === null ? null : Number(overall.average),
      },
    };
  }

  /**
   * Una fila por período y fuente. Los días son de Córdoba; las fechas de pedidos, trabajos y
   * reseñas se pasan a Córdoba antes de agrupar.
   */
  private rows(
    profileId: string,
    userId: string,
    range: DateRange,
    groupBy: MetricsGroupBy,
  ): Promise<Row[]> {
    const local = (column: string) => `(${column} AT TIME ZONE ${ZONE})::date`;
    const inRange = (column: string) => `${local(column)} BETWEEN $3::date AND $4::date`;
    const bucket = (dateExpr: string) =>
      `to_char(date_trunc($5, (${dateExpr})::timestamp), 'YYYY-MM-DD')`;
    return this.dataSource.query<Row[]>(
      `SELECT bucket,
              sum(profile_viewers) AS profile_viewers, sum(search_appearances) AS search_appearances,
              sum(first_place) AS first_place, sum(requests) AS requests,
              sum(completed) AS completed, sum(rating_count) AS rating_count,
              sum(rating_sum) AS rating_sum
         FROM (
           SELECT ${bucket('m.day')} AS bucket, m.profile_viewers, m.search_appearances,
                  m.first_place, 0 AS requests, 0 AS completed, 0 AS rating_count, 0 AS rating_sum
             FROM professional_metrics_daily m
            WHERE m.professional_id = $1 AND m.day BETWEEN $3::date AND $4::date
           UNION ALL
           SELECT ${bucket(local('t.created_at'))}, 0, 0, 0, 1, 0, 0, 0
             FROM service_request_targets t
            WHERE t.professional_id = $2 AND ${inRange('t.created_at')}
           UNION ALL
           SELECT ${bucket(local('c.completed_at'))}, 0, 0, 0, 0, 1, 0, 0
             FROM service_contracts c
            WHERE c.professional_id = $2 AND c.status = 'COMPLETED' AND ${inRange('c.completed_at')}
           UNION ALL
           SELECT ${bucket(local('r.created_at'))}, 0, 0, 0, 0, 0, 1, r.rating
             FROM reviews r
            WHERE r.professional_id = $2 AND r.status = 'VISIBLE' AND r.deleted_at IS NULL
              AND ${inRange('r.created_at')}
         ) moves
        GROUP BY bucket`,
      [profileId, userId, range.from, range.to, groupBy],
    );
  }
}
