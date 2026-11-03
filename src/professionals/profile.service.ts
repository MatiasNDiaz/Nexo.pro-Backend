import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In, IsNull, MoreThanOrEqual, Not } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { ApiErrorDetail } from '../common/errors/api-error';
import { NeighborhoodsService } from '../locations/neighborhoods.service';
import { Profession } from '../professions/entities/profession.entity';
import { SubscriptionPlan, ThemeLevel } from '../subscriptions/entities/subscription-plan.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FileKind, FilePurpose } from '../uploads/file.enums';
import { subscriptionRequired, UploadsService } from '../uploads/uploads.service';
import { cordobaClock, effectiveAttentionStatus } from './attention-status';
import type {
  AddAvailabilityExceptionDto,
  AddCertificationDto,
  AddMediaDto,
  AttentionStatusDto,
  CertificationItemDto,
  MediaItemDto,
  ProfessionalMeDto,
  ProfileThemeDto,
  ReplaceAvailabilityDto,
  ReplaceProfessionsDto,
  ReplaceServiceAreasDto,
  ReplaceSocialLinksDto,
  UpdateProfessionalProfileDto,
} from './dto/professional-profile.dto';
import { AvailabilityException, AvailabilitySlot } from './entities/availability.entity';
import { ProfessionalCertification } from './entities/professional-certification.entity';
import { ProfessionalMedia } from './entities/professional-media.entity';
import { ProfessionalProfession } from './entities/professional-profession.entity';
import { ProfessionalProfile } from './entities/professional-profile.entity';
import { ProfessionalServiceArea } from './entities/professional-service-area.entity';
import { ProfessionalSocialLink } from './entities/professional-social-link.entity';
import { fitToLimit } from './plan-limits';
import {
  AttentionStatus,
  CertStatus,
  MediaPurpose,
  MediaStatus,
  ProItemStatus,
} from './professional.enums';
import { ProfessionalsService } from './professionals.service';
import { type ProfileTheme, themeFieldsNotAllowed } from './profile-theme';
import { normalizeSocialUrl } from './social-links';

export const ProfessionalEvents = {
  /** El profesional se puso "Disponible" a mano (después del cambio). */
  MARKED_AVAILABLE: 'professionals.marked-available',
} as const;

export interface MarkedAvailableEvent {
  userId: string;
}

/** Máximo de certificados por profesional, en todos los planes (ADR 0020). */
export const MAX_CERTIFICATIONS = 10;
/** Días sin atención cargados a futuro. */
export const MAX_FUTURE_EXCEPTIONS = 30;
const MAX_ATTENTION_OVERRIDE_MS = 7 * 24 * 60 * 60 * 1000;

const PURPOSES_BY_KIND: Record<'IMAGE' | 'VIDEO', readonly MediaPurpose[]> = {
  IMAGE: [MediaPurpose.PRESENTATION, MediaPurpose.WORK, MediaPurpose.BANNER],
  VIDEO: [MediaPurpose.CATALOG_VIDEO, MediaPurpose.PROFILE_VIDEO, MediaPurpose.BANNER],
};

const planLimit = (message: string) =>
  new ForbiddenException({ code: 'PLAN_LIMIT_REACHED', message });

/**
 * El perfil que edita el propio profesional (FI §7 y §10). Los límites (profesiones, medios, tema)
 * salen del plan vigente; sin prueba ni plan vigente se puede editar el texto pero no sumar
 * contenido (FI §6.5). Cada cambio bloquea el perfil para que dos pestañas no superen un límite.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly professionals: ProfessionalsService,
    private readonly neighborhoods: NeighborhoodsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly uploads: UploadsService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly events: EventEmitter2,
  ) {}

  async me(userId: string, now = new Date()): Promise<ProfessionalMeDto> {
    const manager = this.dataSource.manager;
    const profile = await this.ownProfile(manager, userId);
    const id = profile.id;
    const [professions, areas, media, certifications, links, slots, exceptions] = await Promise.all(
      [
        manager.getRepository(ProfessionalProfession).find({
          where: { professionalId: id },
          relations: { profession: true },
          order: { isPrimary: 'DESC', createdAt: 'ASC' },
        }),
        manager.getRepository(ProfessionalServiceArea).find({
          where: { professionalId: id },
          relations: { locality: true, neighborhood: true },
          order: { createdAt: 'ASC' },
        }),
        manager.getRepository(ProfessionalMedia).find({
          where: { professionalId: id },
          relations: { file: true },
          order: { purpose: 'ASC', position: 'ASC' },
        }),
        manager.getRepository(ProfessionalCertification).find({
          where: { professionalId: id },
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
        }),
      ],
    );

    return {
      id,
      slug: profile.slug,
      businessName: profile.businessName,
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      worksWithTeam: profile.worksWithTeam,
      hasMobility: profile.hasMobility,
      referenceRate: profile.referenceRate,
      rateMode: profile.rateMode,
      freeQuote: profile.freeQuote,
      theme: profile.theme,
      attention: {
        manual: profile.attentionStatus,
        until: profile.attentionStatusUntil,
        autoFromSchedule: profile.autoStatusFromSchedule,
        effective: effectiveAttentionStatus({ ...profile, slots, exceptions }, now),
      },
      professions: professions.map((p) => ({
        id: p.professionId,
        name: p.profession?.name ?? '',
        isPrimary: p.isPrimary,
        status: p.status,
      })),
      serviceAreas: areas.map((a) => ({
        localityId: a.localityId,
        localityName: a.locality?.name ?? '',
        neighborhoodId: a.neighborhoodId,
        neighborhoodName: a.neighborhood?.name ?? null,
      })),
      media: media.map((m) => this.mediaItem(m)),
      certifications: certifications.map((c) => this.certificationItem(c)),
      socialLinks: links.map(({ network, url }) => ({ network, url })),
      availability: {
        slots: slots.map((s) => ({
          weekday: s.weekday,
          start: s.startTime.slice(0, 5),
          end: s.endTime.slice(0, 5),
        })),
        exceptions: exceptions.map(({ id: exceptionId, startDate, endDate, type, note }) => ({
          id: exceptionId,
          startDate,
          endDate,
          type,
          note,
        })),
      },
    };
  }

  /** Datos del perfil. El admin también puede editarlos, con motivo y auditoría (ADR 0021). */
  async update(
    userId: string,
    dto: UpdateProfessionalProfileDto,
    byAdmin?: { adminId: string; reason: string },
  ): Promise<ProfessionalMeDto> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const referenceRate =
        dto.referenceRate === undefined
          ? profile.referenceRate
          : dto.referenceRate === null
            ? null
            : dto.referenceRate.toFixed(2);
      const rateMode = dto.rateMode === undefined ? profile.rateMode : dto.rateMode;
      if ((referenceRate === null) !== (rateMode === null)) {
        throw new BadRequestException({
          code: 'RATE_INCOMPLETE',
          message: 'La tarifa de referencia va con su modalidad (por visita, hora o trabajo).',
        });
      }
      await manager.getRepository(ProfessionalProfile).update(profile.id, {
        ...(dto.businessName !== undefined && { businessName: dto.businessName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.yearsExperience !== undefined && { yearsExperience: dto.yearsExperience }),
        ...(dto.worksWithTeam !== undefined && { worksWithTeam: dto.worksWithTeam }),
        ...(dto.hasMobility !== undefined && { hasMobility: dto.hasMobility }),
        ...(dto.freeQuote !== undefined && { freeQuote: dto.freeQuote }),
        ...(dto.autoStatusFromSchedule !== undefined && {
          autoStatusFromSchedule: dto.autoStatusFromSchedule,
        }),
        referenceRate,
        rateMode,
      });
      if (byAdmin) {
        const fields = Object.keys(dto).filter(
          (key) => dto[key as keyof UpdateProfessionalProfileDto] !== undefined,
        );
        await this.audit.record(
          {
            actorId: byAdmin.adminId,
            action: 'PROFESSIONAL_PROFILE_UPDATED',
            targetType: 'USER',
            targetId: userId,
            reason: byAdmin.reason,
            result: 'SUCCESS',
            metadata: { fields: fields.join(',') },
          },
          manager,
        );
      }
    });
    return this.me(userId);
  }

  /** Reemplaza la personalización. Solo lo que admite el plan vigente (FI §6.3). */
  async setTheme(userId: string, dto: ProfileThemeDto): Promise<ProfessionalMeDto> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const plan = await this.requirePlan(manager, userId);
      const theme: ProfileTheme = JSON.parse(JSON.stringify(dto)) as ProfileTheme;
      const notAllowed = themeFieldsNotAllowed(theme, plan.themeLevel);
      if (notAllowed.length) {
        throw new ForbiddenException({
          code: 'THEME_NOT_IN_PLAN',
          message: 'Tu plan no incluye esa personalización.',
          details: notAllowed.map((field) => ({ field, errors: ['No incluido en tu plan.'] })),
        });
      }
      await manager.getRepository(ProfessionalProfile).update(profile.id, { theme });
    });
    return this.me(userId);
  }

  async setAttention(
    userId: string,
    dto: AttentionStatusDto,
    now = new Date(),
  ): Promise<ProfessionalMeDto> {
    const until = dto.until ? new Date(dto.until) : null;
    if (until && (until <= now || until.getTime() - now.getTime() > MAX_ATTENTION_OVERRIDE_MS)) {
      throw new BadRequestException({
        code: 'INVALID_UNTIL',
        message: 'El vencimiento tiene que ser en el futuro y dentro de los próximos 7 días.',
      });
    }
    const before = (await this.me(userId, now)).attention.effective;
    const profile = await this.ownProfile(this.dataSource.manager, userId);
    await this.dataSource
      .getRepository(ProfessionalProfile)
      .update(profile.id, { attentionStatus: dto.status, attentionStatusUntil: until });
    const after = await this.me(userId, now);
    // Aviso a quienes lo tienen en favoritos (ADR 0028): solo al ponerse "Disponible" a mano.
    if (
      before !== AttentionStatus.AVAILABLE &&
      after.attention.effective === AttentionStatus.AVAILABLE
    ) {
      const event: MarkedAvailableEvent = { userId };
      await this.events.emitAsync(ProfessionalEvents.MARKED_AVAILABLE, event);
    }
    return after;
  }

  /** Profesiones: entre 1 y las que permita el plan, con una principal (FI §6.3 y §7.1). */
  async replaceProfessions(userId: string, dto: ReplaceProfessionsDto): Promise<ProfessionalMeDto> {
    if (!dto.professionIds.includes(dto.primaryId)) {
      throw new BadRequestException({
        code: 'INVALID_PRIMARY_PROFESSION',
        message: 'La profesión principal tiene que estar en la lista.',
      });
    }
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const plan = await this.requirePlan(manager, userId);
      if (dto.professionIds.length > plan.maxProfessions) {
        throw planLimit(`Tu plan permite hasta ${plan.maxProfessions} profesiones.`);
      }
      const found = await manager
        .getRepository(Profession)
        .countBy({ id: In(dto.professionIds), active: true });
      if (found !== dto.professionIds.length) {
        throw new BadRequestException({
          code: 'INVALID_PROFESSION',
          message: 'Alguna de las profesiones no existe.',
        });
      }
      const repository = manager.getRepository(ProfessionalProfession);
      await repository.delete({ professionalId: profile.id });
      await repository.insert(
        dto.professionIds.map((professionId) => ({
          professionalId: profile.id,
          professionId,
          isPrimary: professionId === dto.primaryId,
          status: ProItemStatus.ACTIVE,
        })),
      );
    });
    return this.me(userId);
  }

  /** Zonas de trabajo (ADR 0010). Los barrios nuevos quedan PENDING y a nombre del profesional. */
  async replaceServiceAreas(
    userId: string,
    dto: ReplaceServiceAreasDto,
  ): Promise<ProfessionalMeDto> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const created = await this.professionals.replaceServiceAreas(
        manager,
        profile.id,
        dto.serviceAreas,
      );
      for (const id of created) await this.neighborhoods.setCreator(manager, id, userId);
    });
    return this.me(userId);
  }

  /**
   * Suma una imagen o un video (FI §6.3). Cuenta solo el total del plan (no el reparto
   * presentación/trabajos, aprobado el 02/11/2026). El banner no cuenta; uno nuevo reemplaza al
   * anterior. Imagen de banner: Medium o más; video de banner: Premium.
   */
  async addMedia(userId: string, dto: AddMediaDto): Promise<MediaItemDto> {
    let replaced: StoredFile[] = [];
    const created = await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const plan = await this.requirePlan(manager, userId);
      const file = await this.uploads.lockReadyFile(
        manager,
        userId,
        dto.fileId,
        FilePurpose.PROFILE_MEDIA,
      );
      await this.assertFileUnused(manager, file.id);
      const kind = file.kind === FileKind.VIDEO ? 'VIDEO' : 'IMAGE';
      if (!PURPOSES_BY_KIND[kind].includes(dto.purpose)) {
        throw new BadRequestException({
          code: 'INVALID_MEDIA_PURPOSE',
          message: `Ese uso no corresponde a un${kind === 'VIDEO' ? ' video' : 'a imagen'}.`,
        });
      }
      if (kind === 'VIDEO' && (file.durationMs ?? 0) > plan.maxVideoSeconds * 1000 + 500) {
        throw planLimit(`Tu plan admite videos de hasta ${plan.maxVideoSeconds} segundos.`);
      }

      const repository = manager.getRepository(ProfessionalMedia);
      if (dto.purpose === MediaPurpose.BANNER) {
        const required = kind === 'VIDEO' ? ThemeLevel.EXTENDED : ThemeLevel.STANDARD;
        if (!themeLevelAtLeast(plan.themeLevel, required)) {
          throw planLimit('Tu plan no incluye ese banner.');
        }
        const previous = await repository.find({
          where: { professionalId: profile.id, purpose: MediaPurpose.BANNER },
        });
        await repository.delete({ id: In(previous.map((m) => m.id)) });
        replaced = await this.uploads.markDeleted(
          manager,
          previous.map((m) => m.fileId),
        );
      } else {
        const used = await this.countMedia(manager, profile.id, file.kind);
        const max = kind === 'VIDEO' ? plan.maxVideos : plan.maxImages;
        if (used >= max) {
          throw planLimit(
            kind === 'VIDEO'
              ? `Tu plan permite hasta ${max} videos.`
              : `Tu plan permite hasta ${max} imágenes.`,
          );
        }
      }

      const last = await repository.maximum('position', {
        professionalId: profile.id,
        purpose: dto.purpose,
      });
      const media = repository.create({
        professionalId: profile.id,
        fileId: file.id,
        purpose: dto.purpose,
        position: last === null ? 0 : last + 1,
      });
      await repository.insert(media);
      return repository.findOneOrFail({ where: { id: media.id }, relations: { file: true } });
    });
    await this.uploads.deleteFromStorage(replaced);
    return this.mediaItem(created);
  }

  /** Nuevo orden: hay que mandar todos los medios del profesional. */
  async reorderMedia(userId: string, ids: string[]): Promise<ProfessionalMeDto> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const current = await manager
        .getRepository(ProfessionalMedia)
        .findBy({ professionalId: profile.id });
      const same =
        current.length === ids.length && current.every((media) => ids.includes(media.id));
      if (!same) {
        throw new BadRequestException({
          code: 'INVALID_MEDIA_ORDER',
          message: 'Mandá todos tus medios, cada uno una vez.',
        });
      }
      for (const [position, id] of ids.entries()) {
        await manager.getRepository(ProfessionalMedia).update(id, { position });
      }
    });
    return this.me(userId);
  }

  async removeMedia(userId: string, mediaId: string): Promise<void> {
    const files = await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const media = await manager
        .getRepository(ProfessionalMedia)
        .findOneBy({ id: mediaId, professionalId: profile.id });
      if (!media) throw new NotFoundException();
      await manager.getRepository(ProfessionalMedia).delete(media.id);
      return this.uploads.markDeleted(manager, [media.fileId]);
    });
    await this.uploads.deleteFromStorage(files);
  }

  /**
   * Certificado (ADR 0020): se publica en el momento, con la confirmación de que no muestra datos
   * sensibles. Máximo 10 por profesional.
   */
  async addCertification(userId: string, dto: AddCertificationDto): Promise<CertificationItemDto> {
    const created = await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      await this.requirePlan(manager, userId);
      const repository = manager.getRepository(ProfessionalCertification);
      if ((await repository.countBy({ professionalId: profile.id })) >= MAX_CERTIFICATIONS) {
        throw new ConflictException({
          code: 'CERTIFICATION_LIMIT_REACHED',
          message: `Podés cargar hasta ${MAX_CERTIFICATIONS} certificados.`,
        });
      }
      const file = await this.uploads.lockReadyFile(
        manager,
        userId,
        dto.fileId,
        FilePurpose.CERTIFICATE,
      );
      await this.assertFileUnused(manager, file.id);
      const certification = repository.create({
        professionalId: profile.id,
        fileId: file.id,
        title: dto.title,
        institution: dto.institution ?? null,
        issuedYear: dto.issuedYear ?? null,
        sensitiveDataConfirmedAt: new Date(),
      });
      await repository.insert(certification);
      return repository.findOneOrFail({
        where: { id: certification.id },
        relations: { file: true },
      });
    });
    return this.certificationItem(created);
  }

  async removeCertification(userId: string, certificationId: string): Promise<void> {
    const files = await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const certification = await manager
        .getRepository(ProfessionalCertification)
        .findOneBy({ id: certificationId, professionalId: profile.id });
      if (!certification) throw new NotFoundException();
      await manager.getRepository(ProfessionalCertification).delete(certification.id);
      return this.uploads.markDeleted(manager, [certification.fileId]);
    });
    await this.uploads.deleteFromStorage(files);
  }

  async replaceSocialLinks(userId: string, dto: ReplaceSocialLinksDto): Promise<ProfessionalMeDto> {
    const problems: ApiErrorDetail[] = [];
    const seen = new Set<string>();
    const links = dto.links.map((link, index) => {
      const url = normalizeSocialUrl(link.network, link.url);
      if (!url) {
        problems.push({
          field: `links.${index}.url`,
          errors: ['Tiene que ser un enlace https de esa red.'],
        });
      }
      if (seen.has(link.network)) {
        problems.push({ field: `links.${index}.network`, errors: ['Una sola por red.'] });
      }
      seen.add(link.network);
      return { network: link.network, url: url ?? '' };
    });
    if (problems.length) {
      throw new BadRequestException({
        code: 'INVALID_SOCIAL_LINKS',
        message: 'Revisá las redes sociales.',
        details: problems,
      });
    }
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const repository = manager.getRepository(ProfessionalSocialLink);
      await repository.delete({ professionalId: profile.id });
      if (links.length) {
        await repository.insert(links.map((link) => ({ ...link, professionalId: profile.id })));
      }
    });
    return this.me(userId);
  }

  /** Horario semanal completo (hora de Córdoba), sin franjas superpuestas en un mismo día. */
  async replaceAvailability(
    userId: string,
    dto: ReplaceAvailabilityDto,
  ): Promise<ProfessionalMeDto> {
    const sorted = [...dto.slots].sort(
      (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
    );
    for (const [index, slot] of sorted.entries()) {
      const previous = sorted[index - 1];
      if (
        slot.start >= slot.end ||
        (previous?.weekday === slot.weekday && previous.end > slot.start)
      ) {
        throw new BadRequestException({
          code: 'INVALID_AVAILABILITY',
          message:
            'Cada franja tiene que empezar antes de terminar y no pisarse con otra del mismo día.',
        });
      }
    }
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const repository = manager.getRepository(AvailabilitySlot);
      await repository.delete({ professionalId: profile.id });
      if (sorted.length) {
        await repository.insert(
          sorted.map((slot) => ({
            professionalId: profile.id,
            weekday: slot.weekday,
            startTime: slot.start,
            endTime: slot.end,
          })),
        );
      }
    });
    return this.me(userId);
  }

  async addException(
    userId: string,
    dto: AddAvailabilityExceptionDto,
    now = new Date(),
  ): Promise<ProfessionalMeDto> {
    const today = cordobaClock(now).date;
    const limit = cordobaClock(new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000)).date;
    if (
      !isValidDate(dto.startDate) ||
      !isValidDate(dto.endDate) ||
      dto.endDate < dto.startDate ||
      dto.endDate < today ||
      dto.startDate > limit
    ) {
      throw new BadRequestException({
        code: 'INVALID_EXCEPTION_DATES',
        message: 'Las fechas tienen que ser válidas, en orden y dentro del próximo año.',
      });
    }
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const repository = manager.getRepository(AvailabilityException);
      const future = await repository.countBy({
        professionalId: profile.id,
        endDate: MoreThanOrEqual(today),
      });
      if (future >= MAX_FUTURE_EXCEPTIONS) {
        throw new ConflictException({
          code: 'TOO_MANY_EXCEPTIONS',
          message: `Podés cargar hasta ${MAX_FUTURE_EXCEPTIONS} días sin atención a futuro.`,
        });
      }
      await repository.insert({
        professionalId: profile.id,
        startDate: dto.startDate,
        endDate: dto.endDate,
        type: dto.type,
        note: dto.note ?? null,
      });
    });
    return this.me(userId, now);
  }

  async removeException(userId: string, exceptionId: string): Promise<void> {
    const profile = await this.ownProfile(this.dataSource.manager, userId);
    const result = await this.dataSource
      .getRepository(AvailabilityException)
      .delete({ id: exceptionId, professionalId: profile.id });
    if (!result.affected) throw new NotFoundException();
  }

  /**
   * Ajusta lo visible al plan vigente cuando cambia (ADR 0026): al bajar, lo que excede pasa a
   * HIDDEN_BY_PLAN, lo más reciente primero; al subir, vuelve lo oculto por el plan hasta el límite.
   * Nada se borra y lo ocultado por el admin no se toca. Sin plan vigente no hace nada: el perfil
   * entero deja de mostrarse.
   */
  async applyPlanLimits(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await manager.getRepository(ProfessionalProfile).findOne({
        where: { userId, deactivatedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      const plan = profile && (await this.subscriptions.livePlan(userId, manager));
      if (!profile || !plan) return;

      const professions = manager.getRepository(ProfessionalProfession);
      const links = await professions.find({
        where: { professionalId: profile.id },
        order: { createdAt: 'ASC' },
      });
      const fit = fitToLimit(
        links,
        plan.maxProfessions,
        (link) => link.status === ProItemStatus.ACTIVE,
        (link) => link.isPrimary,
      );
      for (const [items, status] of [
        [fit.hide, ProItemStatus.HIDDEN_BY_PLAN],
        [fit.show, ProItemStatus.ACTIVE],
      ] as const) {
        for (const link of items) {
          await professions.update(
            { professionalId: link.professionalId, professionId: link.professionId },
            { status },
          );
        }
      }

      const media = (
        await manager.getRepository(ProfessionalMedia).find({
          where: { professionalId: profile.id, status: Not(MediaStatus.HIDDEN_BY_ADMIN) },
          relations: { file: true },
          order: { createdAt: 'ASC' },
        })
      ).filter((item) => item.purpose !== MediaPurpose.BANNER);
      const fitsDuration = (item: ProfessionalMedia) =>
        item.file?.kind !== FileKind.VIDEO ||
        (item.file.durationMs ?? 0) <= plan.maxVideoSeconds * 1000 + 500;
      const images = media.filter((item) => item.file?.kind !== FileKind.VIDEO);
      const videos = media.filter((item) => item.file?.kind === FileKind.VIDEO);
      const imageFit = fitToLimit(images, plan.maxImages, (m) => m.status === MediaStatus.ACTIVE);
      const videoFit = fitToLimit(
        videos.filter(fitsDuration),
        plan.maxVideos,
        (m) => m.status === MediaStatus.ACTIVE,
      );
      const tooLong = videos.filter((m) => !fitsDuration(m) && m.status === MediaStatus.ACTIVE);
      await this.setMediaStatus(
        manager,
        [...imageFit.hide, ...videoFit.hide, ...tooLong],
        MediaStatus.HIDDEN_BY_PLAN,
      );
      await this.setMediaStatus(manager, [...imageFit.show, ...videoFit.show], MediaStatus.ACTIVE);

      const banners = await manager.getRepository(ProfessionalMedia).find({
        where: {
          professionalId: profile.id,
          purpose: MediaPurpose.BANNER,
          status: Not(MediaStatus.HIDDEN_BY_ADMIN),
        },
        relations: { file: true },
      });
      for (const banner of banners) {
        const required =
          banner.file?.kind === FileKind.VIDEO ? ThemeLevel.EXTENDED : ThemeLevel.STANDARD;
        const allowed = themeLevelAtLeast(plan.themeLevel, required);
        await this.setMediaStatus(
          manager,
          [banner],
          allowed ? MediaStatus.ACTIVE : MediaStatus.HIDDEN_BY_PLAN,
        );
      }
    });
  }

  /**
   * El profesional elige qué imágenes y videos mostrar dentro del límite de su plan (ADR 0026). Lo
   * que no elige queda oculto por el plan (no se borra). No cambia el banner ni lo ocultado por el
   * admin.
   */
  async chooseVisibleMedia(userId: string, ids: string[]): Promise<ProfessionalMeDto> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const plan = await this.requirePlan(manager, userId);
      const media = await manager.getRepository(ProfessionalMedia).find({
        where: {
          professionalId: profile.id,
          purpose: Not(MediaPurpose.BANNER),
          status: Not(MediaStatus.HIDDEN_BY_ADMIN),
        },
        relations: { file: true },
      });
      const chosen = media.filter((item) => ids.includes(item.id));
      if (chosen.length !== ids.length) {
        throw new BadRequestException({
          code: 'INVALID_MEDIA',
          message: 'Elegí entre tus imágenes y videos (sin el banner ni lo ocultado por soporte).',
        });
      }
      const videos = chosen.filter((item) => item.file?.kind === FileKind.VIDEO);
      if (chosen.length - videos.length > plan.maxImages || videos.length > plan.maxVideos) {
        throw planLimit(
          `Tu plan permite mostrar hasta ${plan.maxImages} imágenes y ${plan.maxVideos} videos.`,
        );
      }
      if (videos.some((item) => (item.file?.durationMs ?? 0) > plan.maxVideoSeconds * 1000 + 500)) {
        throw planLimit(`Tu plan admite videos de hasta ${plan.maxVideoSeconds} segundos.`);
      }
      await this.setMediaStatus(manager, chosen, MediaStatus.ACTIVE);
      await this.setMediaStatus(
        manager,
        media.filter((item) => !ids.includes(item.id)),
        MediaStatus.HIDDEN_BY_PLAN,
      );
    });
    return this.me(userId);
  }

  /** Lo mismo con las profesiones: la principal tiene que quedar visible. */
  async chooseVisibleProfessions(userId: string, ids: string[]): Promise<ProfessionalMeDto> {
    await this.dataSource.transaction(async (manager) => {
      const profile = await this.ownProfile(manager, userId, true);
      const plan = await this.requirePlan(manager, userId);
      const repository = manager.getRepository(ProfessionalProfession);
      const links = await repository.findBy({ professionalId: profile.id });
      const chosen = links.filter((link) => ids.includes(link.professionId));
      if (chosen.length !== ids.length || !chosen.some((link) => link.isPrimary)) {
        throw new BadRequestException({
          code: 'INVALID_PROFESSIONS',
          message: 'Elegí entre tus profesiones, incluida la principal.',
        });
      }
      if (chosen.length > plan.maxProfessions) {
        throw planLimit(`Tu plan permite mostrar hasta ${plan.maxProfessions} profesiones.`);
      }
      for (const link of links) {
        await repository.update(
          { professionalId: link.professionalId, professionId: link.professionId },
          {
            status: ids.includes(link.professionId)
              ? ProItemStatus.ACTIVE
              : ProItemStatus.HIDDEN_BY_PLAN,
          },
        );
      }
    });
    return this.me(userId);
  }

  // ---------------------------------------------------------------------------------------------

  private async setMediaStatus(
    manager: EntityManager,
    items: ProfessionalMedia[],
    status: MediaStatus.ACTIVE | MediaStatus.HIDDEN_BY_PLAN,
  ): Promise<void> {
    const ids = items.filter((item) => item.status !== status).map((item) => item.id);
    if (ids.length)
      await manager.getRepository(ProfessionalMedia).update({ id: In(ids) }, { status });
  }

  private async ownProfile(
    manager: EntityManager,
    userId: string,
    lock = false,
  ): Promise<ProfessionalProfile> {
    const profile = await manager.getRepository(ProfessionalProfile).findOne({
      where: { userId, deactivatedAt: IsNull() },
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'No tenés un perfil profesional activo.',
      });
    }
    return profile;
  }

  private async requirePlan(manager: EntityManager, userId: string): Promise<SubscriptionPlan> {
    const plan = await this.subscriptions.livePlan(userId, manager);
    if (!plan) throw subscriptionRequired();
    return plan;
  }

  /** Medios que cuentan para el límite: activos, de ese tipo y que no son banner. */
  private countMedia(manager: EntityManager, professionalId: string, kind: FileKind) {
    return manager.getRepository(ProfessionalMedia).count({
      where: {
        professionalId,
        status: MediaStatus.ACTIVE,
        purpose: Not(MediaPurpose.BANNER),
        file: { kind },
      },
      relations: { file: true },
    });
  }

  private async assertFileUnused(manager: EntityManager, fileId: string): Promise<void> {
    const used =
      (await manager.getRepository(ProfessionalMedia).existsBy({ fileId })) ||
      (await manager.getRepository(ProfessionalCertification).existsBy({ fileId }));
    if (used) {
      throw new ConflictException({ code: 'FILE_IN_USE', message: 'Ese archivo ya está cargado.' });
    }
  }

  private mediaItem(media: ProfessionalMedia): MediaItemDto {
    return {
      id: media.id,
      fileId: media.fileId,
      purpose: media.purpose,
      kind: media.file?.kind ?? FileKind.IMAGE,
      position: media.position,
      status: media.status,
      url:
        media.status === MediaStatus.ACTIVE && media.file ? this.uploads.urlOf(media.file) : null,
      hiddenReason: media.hiddenReason,
    };
  }

  private certificationItem(certification: ProfessionalCertification): CertificationItemDto {
    return {
      id: certification.id,
      title: certification.title,
      institution: certification.institution,
      issuedYear: certification.issuedYear,
      kind: certification.file?.kind ?? FileKind.DOCUMENT,
      status: certification.status,
      url:
        certification.status === CertStatus.ACTIVE && certification.file
          ? this.uploads.urlOf(certification.file)
          : null,
      verified: false,
      hiddenReason: certification.hiddenReason,
    };
  }
}

const LEVEL_ORDER = [ThemeLevel.NONE, ThemeLevel.STANDARD, ThemeLevel.EXTENDED];
function themeLevelAtLeast(level: ThemeLevel, required: ThemeLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(required);
}

function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
