import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, MoreThanOrEqual } from 'typeorm';
import { Neighborhood, NeighborhoodStatus } from '../locations/entities/neighborhood.entity';
import { MetricsCollector, type MetricsViewer } from '../metrics/metrics-collector.service';
import {
  ATTENTION_TIME_ZONE,
  cordobaClock,
  effectiveAttentionStatus,
} from '../professionals/attention-status';
import {
  AvailabilityException,
  AvailabilitySlot,
} from '../professionals/entities/availability.entity';
import { ProfessionalCertification } from '../professionals/entities/professional-certification.entity';
import { ProfessionalMedia } from '../professionals/entities/professional-media.entity';
import { ProfessionalProfession } from '../professionals/entities/professional-profession.entity';
import { ProfessionalProfile } from '../professionals/entities/professional-profile.entity';
import { ProfessionalServiceArea } from '../professionals/entities/professional-service-area.entity';
import { ProfessionalSocialLink } from '../professionals/entities/professional-social-link.entity';
import {
  AttentionStatus,
  CertStatus,
  MediaPurpose,
  MediaStatus,
  ProItemStatus,
  type RateMode,
} from '../professionals/professional.enums';
import { type ProfileTheme, themeFieldsNotAllowed } from '../professionals/profile-theme';
import { SubscriptionPlan, ThemeLevel } from '../subscriptions/entities/subscription-plan.entity';
import { FileKind } from '../uploads/file.enums';
import { ratingColumns } from '../reviews/review-rules';
import { UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import type {
  CatalogItemDto,
  CatalogPageDto,
  CatalogQueryDto,
  PublicAreaDto,
  PublicMediaDto,
  PublicProfileDto,
} from './dto/catalog.dto';

/**
 * Quién aparece en el catálogo (se calcula en cada consulta, sin columna `is_listed`): cuenta activa,
 * identidad aprobada (o aprobada con foto o nombre en revisión, ADR 0019 y 0021), prueba o plan
 * vigente, perfil activo y completo (foto, descripción, una profesión y una zona), y sin la
 * sanción "perfil oculto" vigente (C-29, ADR 0029).
 */
const VISIBLE = `
  p.deactivated_at IS NULL
  AND u.role = 'PROFESSIONAL' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
  AND (u.verification_status = 'APPROVED'
       OR (u.verification_status = 'REQUIRES_REVIEW'
           AND (u.pending_avatar_file_id IS NOT NULL OR u.pending_first_name IS NOT NULL)))
  AND u.avatar_file_id IS NOT NULL AND p.bio IS NOT NULL
  AND EXISTS (SELECT 1 FROM professional_professions pp
               WHERE pp.professional_id = p.id AND pp.status = 'ACTIVE')
  AND EXISTS (SELECT 1 FROM professional_service_areas a WHERE a.professional_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM sanctions sa
                   WHERE sa.user_id = u.id AND sa.type = 'PROFILE_HIDDEN' AND sa.lifted_at IS NULL
                     AND (sa.ends_at IS NULL OR sa.ends_at > now()))`;

/** Suscripción vigente: una prueba o un período vencidos que la tarea todavía no marcó no cuentan. */
const LIVE_SUBSCRIPTION = `
  JOIN subscriptions s ON s.user_id = u.id
   AND s.status IN ('TRIAL', 'ACTIVE')
   AND (s.status <> 'TRIAL' OR s.trial_ends_at > now())
   AND (s.status <> 'ACTIVE' OR s.current_period_end > now())
  JOIN subscription_plans sp ON sp.id = s.plan_id`;

/** Hora de Córdoba. */
const LOCAL = `(now() AT TIME ZONE '${ATTENTION_TIME_ZONE}')`;

/**
 * Estado de atención efectivo en SQL, para filtrar y ordenar. Es la misma regla que
 * `effectiveAttentionStatus` (attention-status.ts); un test e2e compara los dos.
 */
const EFFECTIVE_STATUS = `
  CASE
    WHEN NOT p.auto_status_from_schedule THEN
      CASE WHEN p.attention_status_until IS NULL OR p.attention_status_until > now()
           THEN p.attention_status::text ELSE 'RESTING' END
    WHEN p.attention_status_until > now() THEN p.attention_status::text
    WHEN EXISTS (SELECT 1 FROM availability_exceptions e
                  WHERE e.professional_id = p.id
                    AND ${LOCAL}::date BETWEEN e.start_date AND e.end_date) THEN 'RESTING'
    WHEN EXISTS (SELECT 1 FROM availability_slots sl
                  WHERE sl.professional_id = p.id
                    AND sl.weekday = extract(isodow FROM ${LOCAL})
                    AND sl.start_time <= ${LOCAL}::time AND ${LOCAL}::time < sl.end_time)
      THEN 'AVAILABLE'
    ELSE 'RESTING'
  END`;

/** Perfil más completo (ADR 0022): un punto por cada dato opcional cargado. */
const COMPLETENESS = `
  (p.business_name IS NOT NULL)::int + (p.years_experience IS NOT NULL)::int
  + (p.reference_rate IS NOT NULL)::int
  + EXISTS (SELECT 1 FROM professional_media m WHERE m.professional_id = p.id AND m.status = 'ACTIVE')::int
  + EXISTS (SELECT 1 FROM professional_certifications c
             WHERE c.professional_id = p.id AND c.status = 'ACTIVE')::int
  + EXISTS (SELECT 1 FROM professional_social_links l WHERE l.professional_id = p.id)::int
  + EXISTS (SELECT 1 FROM availability_slots sl WHERE sl.professional_id = p.id)::int`;

interface CatalogRow {
  id: string;
  user_id: string;
  slug: string;
  first_name: string;
  last_name: string;
  business_name: string | null;
  bio: string | null;
  years_experience: number | null;
  reference_rate: string | null;
  rate_mode: RateMode | null;
  free_quote: boolean;
  avatar_file_id: string;
  effective_status: AttentionStatus;
  plan_id: string;
  rating_average: string | null;
  rating_count: string;
  total: string;
}

const LEVELS = [ThemeLevel.NONE, ThemeLevel.STANDARD, ThemeLevel.EXTENDED];
const atLeast = (level: ThemeLevel, required: ThemeLevel) =>
  LEVELS.indexOf(level) >= LEVELS.indexOf(required);

/** Catálogo público (FI §8) y página pública del profesional. Orden: ADR 0022. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly metrics: MetricsCollector,
  ) {}

  /** Con `viewer`, la página cuenta para las métricas de quienes aparecen (ADR 0033). */
  async search(query: CatalogQueryDto, viewer?: MetricsViewer | null): Promise<CatalogPageDto> {
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const filters: string[] = [];
    if (query.professionId) {
      filters.push(`EXISTS (SELECT 1 FROM professional_professions pp
        WHERE pp.professional_id = p.id AND pp.status = 'ACTIVE' AND pp.profession_id = ${param(query.professionId)})`);
    }
    if (query.localityId) {
      filters.push(`EXISTS (SELECT 1 FROM professional_service_areas a
        WHERE a.professional_id = p.id AND a.locality_id = ${param(query.localityId)})`);
    }
    if (query.neighborhoodId) {
      const neighborhood = await this.dataSource.getRepository(Neighborhood).findOneBy({
        id: query.neighborhoodId,
        status: NeighborhoodStatus.APPROVED,
      });
      if (!neighborhood) {
        throw new BadRequestException({
          code: 'INVALID_NEIGHBORHOOD',
          message: 'El barrio no existe o todavía no está aprobado.',
        });
      }
      // Quien cubre toda la localidad también trabaja en ese barrio.
      filters.push(`EXISTS (SELECT 1 FROM professional_service_areas a
        WHERE a.professional_id = p.id
          AND (a.neighborhood_id = ${param(neighborhood.id)}
               OR (a.neighborhood_id IS NULL AND a.locality_id = ${param(neighborhood.localityId)})))`);
    }
    if (query.availableNow) filters.push(`st.effective_status = 'AVAILABLE'`);

    const limit = param(query.limit);
    const offset = param((query.page - 1) * query.limit);
    const rows: CatalogRow[] = await this.dataSource.query(
      `SELECT p.id, p.user_id, p.slug, u.first_name, u.last_name, p.business_name, p.bio,
              p.years_experience, p.reference_rate, p.rate_mode, p.free_quote, u.avatar_file_id,
              st.effective_status, sp.id AS plan_id, ${ratingColumns('u.id')},
              count(*) OVER () AS total
         FROM professional_profiles p
         JOIN users u ON u.id = p.user_id
         ${LIVE_SUBSCRIPTION}
         CROSS JOIN LATERAL (SELECT ${EFFECTIVE_STATUS} AS effective_status) st
        WHERE ${[VISIBLE, ...filters].join(' AND ')}
        ORDER BY sp.ranking_tier DESC,
                 (st.effective_status = 'AVAILABLE') DESC,
                 (${COMPLETENESS}) DESC,
                 p.created_at ASC, p.id ASC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    if (viewer) {
      this.metrics.recordSearch(
        rows.map((r) => ({ profileId: r.id, userId: r.user_id })),
        query.page,
        viewer,
      );
    }
    return {
      data: await this.hydrate(rows),
      page: query.page,
      limit: query.limit,
      total: rows.length ? Number(rows[0].total) : 0,
    };
  }

  /** ¿El profesional aparece en el catálogo? (solo a esos se les puede escribir, ADR 0024). */
  async isListed(userId: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM professional_profiles p
         JOIN users u ON u.id = p.user_id
         ${LIVE_SUBSCRIPTION}
        WHERE u.id = $1 AND ${VISIBLE}`,
      [userId],
    );
    return rows.length > 0;
  }

  async profile(
    slug: string,
    now = new Date(),
    viewer?: MetricsViewer | null,
  ): Promise<PublicProfileDto> {
    const rows: CatalogRow[] = await this.dataSource.query(
      `SELECT p.id, p.user_id, p.slug, u.first_name, u.last_name, p.business_name, p.bio,
              p.years_experience, p.reference_rate, p.rate_mode, p.free_quote, u.avatar_file_id,
              st.effective_status, sp.id AS plan_id, ${ratingColumns('u.id')}, 1 AS total
         FROM professional_profiles p
         JOIN users u ON u.id = p.user_id
         ${LIVE_SUBSCRIPTION}
         CROSS JOIN LATERAL (SELECT ${EFFECTIVE_STATUS} AS effective_status) st
        WHERE p.slug = $1 AND ${VISIBLE}`,
      [slug],
    );
    if (!rows[0]) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'El perfil no existe.' });
    }
    if (viewer) {
      this.metrics.recordProfileView({ profileId: rows[0].id, userId: rows[0].user_id }, viewer);
    }
    const [item] = await this.hydrate(rows);
    const id = rows[0].id;
    const manager = this.dataSource.manager;
    const [profile, user, plan, media, certifications, links, slots, exceptions] =
      await Promise.all([
        manager.getRepository(ProfessionalProfile).findOneByOrFail({ id }),
        manager.getRepository(User).findOneByOrFail({ id: rows[0].user_id }),
        manager.getRepository(SubscriptionPlan).findOneByOrFail({ id: rows[0].plan_id }),
        manager.getRepository(ProfessionalMedia).find({
          where: { professionalId: id, status: MediaStatus.ACTIVE },
          relations: { file: true },
          order: { position: 'ASC', createdAt: 'ASC' },
        }),
        manager.getRepository(ProfessionalCertification).find({
          where: { professionalId: id, status: CertStatus.ACTIVE },
          relations: { file: true },
          order: { createdAt: 'ASC' },
        }),
        manager.getRepository(ProfessionalSocialLink).find({
          where: { professionalId: id },
          order: { network: 'ASC' },
        }),
        manager.getRepository(AvailabilitySlot).find({
          where: { professionalId: id },
          order: { weekday: 'ASC', startTime: 'ASC' },
        }),
        manager.getRepository(AvailabilityException).find({
          where: { professionalId: id, endDate: MoreThanOrEqual(cordobaClock(now).date) },
          order: { startDate: 'ASC' },
          take: 10,
        }),
      ]);

    // Lo que exceda el plan actual no se muestra (al bajar de plan no se borra nada, FI §6.4).
    const shown: PublicMediaDto[] = [];
    let banner: PublicMediaDto | null = null;
    let images = 0;
    let videos = 0;
    for (const m of media) {
      const url = m.file ? this.uploads.urlOf(m.file) : null;
      if (!url || !m.file) continue;
      const isVideo = m.file.kind === FileKind.VIDEO;
      const entry = { purpose: m.purpose, kind: m.file.kind, url };
      if (m.purpose === MediaPurpose.BANNER) {
        const required = isVideo ? ThemeLevel.EXTENDED : ThemeLevel.STANDARD;
        if (!banner && atLeast(plan.themeLevel, required)) banner = entry;
      } else if (isVideo ? videos++ < plan.maxVideos : images++ < plan.maxImages) {
        shown.push(entry);
      }
    }
    const hiddenFields = new Set(themeFieldsNotAllowed(profile.theme, plan.themeLevel));
    const theme = Object.fromEntries(
      Object.entries(profile.theme).filter(([key]) => !hiddenFields.has(key)),
    ) as ProfileTheme;

    return {
      ...item,
      attentionStatus: effectiveAttentionStatus({ ...profile, slots, exceptions }, now),
      worksWithTeam: profile.worksWithTeam,
      hasMobility: profile.hasMobility,
      email: user.email,
      phone: user.phone,
      theme,
      banner,
      media: shown,
      certifications: certifications.flatMap((c) => {
        const url = c.file ? this.uploads.urlOf(c.file) : null;
        return url && c.file
          ? [
              {
                title: c.title,
                institution: c.institution,
                issuedYear: c.issuedYear,
                kind: c.file.kind,
                url,
                verified: false as const,
              },
            ]
          : [];
      }),
      socialLinks: links.map(({ network, url }) => ({ network, url })),
      availability: {
        slots: slots.map((s) => ({
          weekday: s.weekday,
          start: s.startTime.slice(0, 5),
          end: s.endTime.slice(0, 5),
        })),
        exceptions: exceptions.map(({ startDate, endDate, type }) => ({
          startDate,
          endDate,
          type,
        })),
      },
    };
  }

  /** Completa cada fila con profesiones, zonas públicas, foto, portada y video, en pocas consultas. */
  private async hydrate(rows: CatalogRow[]): Promise<CatalogItemDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const manager = this.dataSource.manager;
    const [professions, areas, media, plans] = await Promise.all([
      manager.getRepository(ProfessionalProfession).find({
        where: { professionalId: In(ids), status: ProItemStatus.ACTIVE },
        relations: { profession: true },
        order: { isPrimary: 'DESC', createdAt: 'ASC' },
      }),
      manager.getRepository(ProfessionalServiceArea).find({
        where: { professionalId: In(ids) },
        relations: { locality: true, neighborhood: true },
        order: { createdAt: 'ASC' },
      }),
      manager.getRepository(ProfessionalMedia).find({
        where: {
          professionalId: In(ids),
          status: MediaStatus.ACTIVE,
          purpose: In([MediaPurpose.PRESENTATION, MediaPurpose.CATALOG_VIDEO]),
        },
        relations: { file: true },
        order: { position: 'ASC', createdAt: 'ASC' },
      }),
      manager
        .getRepository(SubscriptionPlan)
        .findBy({ id: In([...new Set(rows.map((row) => row.plan_id))]) }),
    ]);
    const avatars = await this.uploads.publicUrls(rows.map((row) => row.avatar_file_id));

    return rows.map((row) => {
      const plan = plans.find((p) => p.id === row.plan_id);
      const firstOf = (purpose: MediaPurpose) => {
        const found = media.find((m) => m.professionalId === row.id && m.purpose === purpose);
        return found?.file ? this.uploads.urlOf(found.file) : null;
      };
      return {
        slug: row.slug,
        professionalUserId: row.user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        businessName: row.business_name,
        avatarUrl: avatars.get(row.avatar_file_id) ?? null,
        bio: row.bio,
        yearsExperience: row.years_experience,
        referenceRate: row.reference_rate,
        rateMode: row.rate_mode,
        freeQuote: row.free_quote,
        attentionStatus: row.effective_status,
        identityVerified: true as const,
        professions: professions
          .filter((p) => p.professionalId === row.id)
          .map((p) => ({
            id: p.professionId,
            name: p.profession?.name ?? '',
            isPrimary: p.isPrimary,
          })),
        serviceAreas: areas
          .filter((a) => a.professionalId === row.id)
          .flatMap((a): PublicAreaDto[] =>
            // Los barrios todavía no aprobados no se muestran (ADR 0010).
            a.neighborhood && a.neighborhood.status !== NeighborhoodStatus.APPROVED
              ? []
              : [
                  {
                    localityId: a.localityId,
                    localityName: a.locality?.name ?? '',
                    neighborhoodId: a.neighborhoodId,
                    neighborhoodName: a.neighborhood?.name ?? null,
                  },
                ],
          ),
        coverImageUrl: firstOf(MediaPurpose.PRESENTATION),
        catalogVideoUrl: plan && plan.maxVideos > 0 ? firstOf(MediaPurpose.CATALOG_VIDEO) : null,
        ratingAverage: row.rating_average === null ? null : Number(row.rating_average),
        ratingCount: Number(row.rating_count),
      };
    });
  }
}
