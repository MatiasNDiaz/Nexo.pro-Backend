import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { today } from '../common/calendar-periods';

/** Quien mira, ya identificado (`MetricsViewerService`). La clave no sale de la memoria. */
export interface MetricsViewer {
  key: string;
  userId: string | null;
}

export interface ListedProfessional {
  profileId: string;
  userId: string;
}

type Field = 'profileViewers' | 'searchAppearances' | 'firstPlace';
type Counts = Record<Field, number>;

const FLUSH_MS = 60_000;
/**
 * Tope de la lista del día para no contar dos veces a la misma persona. Si se llena (mucho
 * tráfico), se vacía y desde ahí alguien puede contar de nuevo: el número puede subir un poco.
 */
const MAX_SEEN = 500_000;

/**
 * Cuenta visitas al perfil y apariciones en búsquedas (ADR 0033). Personas distintas por día: la
 * lista de quién ya contó vive solo en memoria y se descarta al cambiar el día; en la base quedan
 * los totales. Los contadores se guardan cada minuto (si la app se cae, se pierde como mucho un
 * minuto). Una sola instancia (como el límite de pedidos y el tiempo real).
 */
@Injectable()
export class MetricsCollector implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly logger = new Logger(MetricsCollector.name);
  private counters = new Map<string, Counts>();
  private readonly seen = new Set<string>();
  private seenDay = '';
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.flush();
  }

  /** Abrió el perfil (no cuenta si es el propio profesional). */
  recordProfileView(listed: ListedProfessional, viewer: MetricsViewer): void {
    if (viewer.userId === listed.userId) return;
    this.count(listed.profileId, 'profileViewers', viewer.key);
  }

  /** Una página de resultados del catálogo, en orden. */
  recordSearch(results: ListedProfessional[], page: number, viewer: MetricsViewer): void {
    results.forEach((listed, index) => {
      if (viewer.userId === listed.userId) return;
      this.count(listed.profileId, 'searchAppearances', viewer.key);
      if (page === 1 && index === 0) this.count(listed.profileId, 'firstPlace', viewer.key);
    });
  }

  /** Guarda lo acumulado (cada minuto, al apagar la app y antes de leer las métricas). */
  async flush(): Promise<void> {
    if (this.counters.size === 0) return;
    const pending = this.counters;
    this.counters = new Map();
    const rows = [...pending.entries()].map(([key, counts]) => {
      const [professionalId, day] = key.split('|');
      return [
        professionalId,
        day,
        counts.profileViewers,
        counts.searchAppearances,
        counts.firstPlace,
      ];
    });
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const values = chunk
          .map(
            (_, j) =>
              `($${j * 5 + 1}::uuid, $${j * 5 + 2}::date, $${j * 5 + 3}::int, $${j * 5 + 4}::int, $${j * 5 + 5}::int)`,
          )
          .join(', ');
        await this.dataSource.query(
          `INSERT INTO professional_metrics_daily
             (professional_id, day, profile_viewers, search_appearances, first_place)
           VALUES ${values}
           ON CONFLICT (professional_id, day) DO UPDATE SET
             profile_viewers = professional_metrics_daily.profile_viewers + EXCLUDED.profile_viewers,
             search_appearances = professional_metrics_daily.search_appearances + EXCLUDED.search_appearances,
             first_place = professional_metrics_daily.first_place + EXCLUDED.first_place`,
          chunk.flat(),
        );
      }
    } catch (error) {
      // Son contadores: si la base falla, se pierden esos minutos y se sigue contando.
      this.logger.error('No se pudieron guardar las métricas', error as Error);
    }
  }

  private count(profileId: string, field: Field, viewerKey: string): void {
    const day = today();
    if (day !== this.seenDay) {
      this.seen.clear();
      this.seenDay = day;
    }
    const seenKey = `${field}|${profileId}|${viewerKey}`;
    if (this.seen.has(seenKey)) return;
    if (this.seen.size >= MAX_SEEN) this.seen.clear();
    this.seen.add(seenKey);
    const key = `${profileId}|${day}`;
    const counts = this.counters.get(key) ?? {
      profileViewers: 0,
      searchAppearances: 0,
      firstPlace: 0,
    };
    counts[field] += 1;
    this.counters.set(key, counts);
  }
}
