import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit-logger';
import type { AuthUser } from '../common/decorators';
import { ContentStatus } from '../common/content-status';
import { moderateContent } from '../common/moderate-content';
import { Neighborhood, NeighborhoodStatus } from '../locations/entities/neighborhood.entity';
import { Locality } from '../locations/entities/locality.entity';
import {
  type Notification,
  NotificationTarget,
  NotificationType,
} from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Profession } from '../professions/entities/profession.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { StoredFile } from '../uploads/entities/stored-file.entity';
import { FileKind, FilePurpose, FileVisibility } from '../uploads/file.enums';
import { subscriptionRequired, UploadsService } from '../uploads/uploads.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/user.enums';
import {
  type CreateForumPostDto,
  type CreateForumReplyDto,
  type ForumAuthorDto,
  type ForumLikesDto,
  type ForumPageDto,
  type ForumPostDetailDto,
  type ForumPostDto,
  type ForumQueryDto,
  type ForumReplyDto,
  MAX_POST_IMAGES,
  MAX_POST_VIDEOS,
  type UpdateForumPostDto,
  type UpdateForumReplyDto,
} from './dto/forum.dto';
import {
  ForumPost,
  ForumPostLike,
  ForumPostMedia,
  ForumPostProfession,
  ForumPostType,
  ForumReply,
} from './entities/forum.entities';

const postNotFound = () =>
  new NotFoundException({ code: 'FORUM_POST_NOT_FOUND', message: 'La publicación no existe.' });
const replyNotFound = () =>
  new NotFoundException({ code: 'FORUM_REPLY_NOT_FOUND', message: 'La respuesta no existe.' });

/** Visible al público: ni borrada por su autor ni oculta por el admin. */
const LIVE = { deletedAt: IsNull(), status: ContentStatus.VISIBLE };

/**
 * Foro general (FI §13, ADR 0028). Lectura pública; participan clientes activos y profesionales con
 * plan vigente (sin plan, solo leen). Resuelta no admite respuestas nuevas. Nada se borra de verdad:
 * lo borrado y lo oculto quedan para moderar.
 */
@Injectable()
export class ForumService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  // ---- Lectura pública --------------------------------------------------------------------------

  async list(query: ForumQueryDto): Promise<ForumPageDto> {
    const builder = this.dataSource
      .getRepository(ForumPost)
      .createQueryBuilder('p')
      .where('p.deletedAt IS NULL AND p.status = :visible', { visible: ContentStatus.VISIBLE });
    if (query.type) builder.andWhere('p.type = :type', { type: query.type });
    if (query.authorId) builder.andWhere('p.authorId = :author', { author: query.authorId });
    if (query.localityId)
      builder.andWhere('p.localityId = :locality', { locality: query.localityId });
    if (query.resolved !== undefined) {
      builder.andWhere(query.resolved ? 'p.resolvedAt IS NOT NULL' : 'p.resolvedAt IS NULL');
    }
    if (query.professionId) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM forum_post_professions fp WHERE fp.post_id = p.id AND fp.profession_id = :profession)',
        { profession: query.professionId },
      );
    }
    const [posts, total] = await builder
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { data: await this.toPosts(posts), page: query.page, limit: query.limit, total };
  }

  async get(id: string): Promise<ForumPostDetailDto> {
    const post = await this.dataSource.getRepository(ForumPost).findOneBy({ id, ...LIVE });
    if (!post) throw postNotFound();
    const [view] = await this.toPosts([post]);
    const replies = await this.dataSource.getRepository(ForumReply).find({
      where: { postId: id },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
    // Lo borrado u oculto queda como lugar vacío solo si alguien le contestó.
    const parents = new Set(replies.map((r) => r.parentReplyId));
    const shown = replies.filter((r) => isLive(r) || parents.has(r.id));
    const likes = await this.likeCounts(
      'forum_reply_likes',
      'reply_id',
      shown.map((r) => r.id),
    );
    const authors = await this.authors(shown.filter(isLive).map((r) => r.author as User));
    return {
      ...view,
      replies: shown.map((r): ForumReplyDto => ({
        id: r.id,
        parentReplyId: r.parentReplyId,
        author: isLive(r) ? (authors.get(r.authorId) ?? null) : null,
        body: isLive(r) ? r.body : '',
        proposedPrice: isLive(r) ? r.proposedPrice : null,
        removed: !isLive(r),
        likeCount: likes.get(r.id) ?? 0,
        edited: r.editedAt !== null,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Qué marcó con "me gusta" el usuario en una publicación (la lectura pública no sabe quién es). */
  async myLikes(user: AuthUser, postId: string): Promise<ForumLikesDto> {
    const post = await this.dataSource
      .getRepository(ForumPostLike)
      .existsBy({ postId, userId: user.id });
    const replies: Array<{ reply_id: string }> = await this.dataSource.query(
      `SELECT l.reply_id FROM forum_reply_likes l
         JOIN forum_replies r ON r.id = l.reply_id
        WHERE r.post_id = $1 AND l.user_id = $2`,
      [postId, user.id],
    );
    return { post, replyIds: replies.map((r) => r.reply_id) };
  }

  // ---- Publicaciones ----------------------------------------------------------------------------

  async create(user: AuthUser, dto: CreateForumPostDto): Promise<ForumPostDetailDto> {
    await this.assertCanParticipate(user);
    const id = await this.dataSource.transaction(async (manager) => {
      await this.assertPlace(manager, dto.localityId ?? null, dto.neighborhoodId ?? null);
      const professionIds = await this.validProfessions(manager, dto.professionIds ?? []);
      const files: StoredFile[] = [];
      for (const fileId of dto.mediaFileIds ?? []) {
        files.push(
          await this.uploads.lockReadyFile(manager, user.id, fileId, FilePurpose.FORUM_MEDIA),
        );
      }
      const videos = files.filter((f) => f.kind === FileKind.VIDEO).length;
      if (videos > MAX_POST_VIDEOS || files.length - videos > MAX_POST_IMAGES) {
        throw new BadRequestException({
          code: 'FORUM_MEDIA_LIMIT',
          message: `Podés adjuntar hasta ${MAX_POST_IMAGES} imágenes y ${MAX_POST_VIDEOS} video.`,
        });
      }
      const repository = manager.getRepository(ForumPost);
      const post = repository.create({
        authorId: user.id,
        type: dto.type,
        body: dto.body,
        localityId: dto.localityId ?? null,
        neighborhoodId: dto.neighborhoodId ?? null,
        budgetEstimate: dto.budgetEstimate?.toFixed(2) ?? null,
        deadline: dto.deadline ?? null,
      });
      await repository.insert(post);
      await this.setProfessions(manager, post.id, professionIds);
      if (files.length) {
        await manager
          .getRepository(ForumPostMedia)
          .insert(files.map((file, position) => ({ postId: post.id, fileId: file.id, position })));
      }
      return post.id;
    });
    return this.get(id);
  }

  async update(user: AuthUser, id: string, dto: UpdateForumPostDto): Promise<ForumPostDetailDto> {
    await this.assertCanParticipate(user);
    await this.dataSource.transaction(async (manager) => {
      const post = await this.ownPost(manager, user.id, id);
      const localityId = dto.localityId === undefined ? post.localityId : dto.localityId;
      const neighborhoodId =
        dto.neighborhoodId === undefined
          ? dto.localityId === undefined
            ? post.neighborhoodId
            : null
          : dto.neighborhoodId;
      await this.assertPlace(manager, localityId, neighborhoodId);
      await manager.getRepository(ForumPost).update(post.id, {
        ...(dto.body !== undefined && { body: dto.body }),
        localityId,
        neighborhoodId,
        ...(dto.budgetEstimate !== undefined && {
          budgetEstimate: dto.budgetEstimate === null ? null : dto.budgetEstimate.toFixed(2),
        }),
        ...(dto.deadline !== undefined && { deadline: dto.deadline }),
        editedAt: new Date(),
      });
      if (dto.professionIds) {
        await this.setProfessions(
          manager,
          post.id,
          await this.validProfessions(manager, dto.professionIds),
        );
      }
    });
    return this.get(id);
  }

  /** Borrar la publicación oculta también sus respuestas; las fotos se borran del almacenamiento. */
  async remove(user: AuthUser, id: string): Promise<void> {
    const files = await this.dataSource.transaction(async (manager) => {
      const post = await manager.getRepository(ForumPost).findOne({
        where: { id, authorId: user.id, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!post) throw postNotFound();
      await manager.getRepository(ForumPost).update(post.id, { deletedAt: new Date() });
      const media = await manager.getRepository(ForumPostMedia).findBy({ postId: post.id });
      await manager.getRepository(ForumPostMedia).delete({ postId: post.id });
      return this.uploads.markDeleted(
        manager,
        media.map((m) => m.fileId),
      );
    });
    await this.uploads.deleteFromStorage(files);
  }

  async resolve(user: AuthUser, id: string): Promise<ForumPostDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const post = await this.ownPost(manager, user.id, id);
      if (post.resolvedAt) {
        throw new ConflictException({
          code: 'FORUM_POST_RESOLVED',
          message: 'La publicación ya está resuelta.',
        });
      }
      await manager.getRepository(ForumPost).update(post.id, { resolvedAt: new Date() });
    });
    return this.get(id);
  }

  // ---- Respuestas -------------------------------------------------------------------------------

  async reply(user: AuthUser, postId: string, dto: CreateForumReplyDto): Promise<ForumReplyDto> {
    await this.assertCanParticipate(user);
    const created: Notification[] = [];
    const replyId = await this.dataSource.transaction(async (manager) => {
      const post = await manager.getRepository(ForumPost).findOne({
        where: { id: postId, ...LIVE },
        lock: { mode: 'pessimistic_read' },
      });
      if (!post) throw postNotFound();
      if (post.resolvedAt) {
        throw new ConflictException({
          code: 'FORUM_POST_RESOLVED',
          message: 'La publicación está resuelta: ya no admite respuestas.',
        });
      }
      this.assertPrice(user, post, dto.proposedPrice);
      let parent: ForumReply | null = null;
      if (dto.parentReplyId) {
        parent = await manager
          .getRepository(ForumReply)
          .findOneBy({ id: dto.parentReplyId, postId, ...LIVE });
        if (!parent) throw replyNotFound();
      }
      const repository = manager.getRepository(ForumReply);
      const reply = repository.create({
        postId,
        parentReplyId: parent?.id ?? null,
        authorId: user.id,
        body: dto.body,
        proposedPrice: dto.proposedPrice?.toFixed(2) ?? null,
      });
      await repository.insert(reply);

      // Avisos: al autor de la publicación y al de la respuesta que se contesta (sin repetir).
      const notify = new Set(
        [post.authorId, parent?.authorId].filter((id) => id && id !== user.id),
      );
      for (const userId of notify) {
        created.push(
          await this.notifications.create(manager, {
            userId: userId!,
            type: NotificationType.FORUM_REPLY,
            title: 'Nueva respuesta en el foro',
            body:
              userId === post.authorId
                ? 'Respondieron tu publicación.'
                : 'Respondieron tu comentario.',
            targetType: NotificationTarget.FORUM_POST,
            targetId: postId,
          }),
        );
      }
      return reply.id;
    });
    this.notifications.deliver(created);
    return this.replyView(replyId);
  }

  async updateReply(user: AuthUser, id: string, dto: UpdateForumReplyDto): Promise<ForumReplyDto> {
    await this.assertCanParticipate(user);
    await this.dataSource.transaction(async (manager) => {
      const reply = await this.ownReply(manager, user.id, id);
      const post = await manager.getRepository(ForumPost).findOneBy({ id: reply.postId, ...LIVE });
      if (!post) throw replyNotFound();
      if (dto.proposedPrice) this.assertPrice(user, post, dto.proposedPrice);
      await manager.getRepository(ForumReply).update(reply.id, {
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.proposedPrice !== undefined && {
          proposedPrice: dto.proposedPrice === null ? null : dto.proposedPrice.toFixed(2),
        }),
        editedAt: new Date(),
      });
    });
    return this.replyView(id);
  }

  async removeReply(user: AuthUser, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const reply = await this.ownReply(manager, user.id, id);
      await manager.getRepository(ForumReply).update(reply.id, { deletedAt: new Date() });
    });
  }

  // ---- "Me gusta" -------------------------------------------------------------------------------

  async likePost(user: AuthUser, postId: string, like: boolean): Promise<void> {
    await this.assertCanParticipate(user);
    if (!(await this.dataSource.getRepository(ForumPost).existsBy({ id: postId, ...LIVE }))) {
      throw postNotFound();
    }
    await this.toggle('forum_post_likes', 'post_id', postId, user.id, like);
  }

  async likeReply(user: AuthUser, replyId: string, like: boolean): Promise<void> {
    await this.assertCanParticipate(user);
    if (!(await this.dataSource.getRepository(ForumReply).existsBy({ id: replyId, ...LIVE }))) {
      throw replyNotFound();
    }
    await this.toggle('forum_reply_likes', 'reply_id', replyId, user.id, like);
  }

  // ---- Admin ------------------------------------------------------------------------------------

  async moderatePost(admin: AuthUser, id: string, reason: string, hide: boolean): Promise<void> {
    const fileIds = await this.dataSource.transaction(async (manager) => {
      await moderateContent(manager, this.audit, {
        entity: ForumPost,
        targetType: 'FORUM_POST',
        id,
        adminId: admin.id,
        reason,
        hide,
      });
      // Oculta, sus fotos dejan de ser públicas (como los medios del perfil).
      const media = await manager.getRepository(ForumPostMedia).findBy({ postId: id });
      if (media.length) {
        await manager
          .getRepository(StoredFile)
          .update(
            { id: In(media.map((m) => m.fileId)) },
            { visibility: hide ? FileVisibility.PRIVATE : FileVisibility.PUBLIC },
          );
      }
      return media.map((m) => m.fileId);
    });
    // Después del commit: también en Cloudinary (etapa 12).
    await this.uploads.applyAccess(fileIds);
  }

  async moderateReply(admin: AuthUser, id: string, reason: string, hide: boolean): Promise<void> {
    await this.dataSource.transaction((manager) =>
      moderateContent(manager, this.audit, {
        entity: ForumReply,
        targetType: 'FORUM_REPLY',
        id,
        adminId: admin.id,
        reason,
        hide,
      }),
    );
  }

  // ---------------------------------------------------------------------------------------------

  /** FI §13.2: el profesional sin plan vigente solo lee. */
  private async assertCanParticipate(user: AuthUser): Promise<void> {
    if (user.role !== UserRole.PROFESSIONAL) return;
    if (!(await this.subscriptions.livePlan(user.id))) throw subscriptionRequired();
  }

  private assertPrice(user: AuthUser, post: ForumPost, price: number | undefined | null): void {
    if (price === undefined || price === null) return;
    if (user.role !== UserRole.PROFESSIONAL || post.type !== ForumPostType.PROFESSIONAL_WANTED) {
      throw new BadRequestException({
        code: 'PRICE_NOT_ALLOWED',
        message: 'El presupuesto lo proponen los profesionales en "Solicito profesional".',
      });
    }
  }

  private async assertPlace(
    manager: EntityManager,
    localityId: string | null,
    neighborhoodId: string | null,
  ): Promise<void> {
    if (neighborhoodId && !localityId) {
      throw new BadRequestException({
        code: 'INVALID_PLACE',
        message: 'El barrio va con su localidad.',
      });
    }
    if (localityId && !(await manager.getRepository(Locality).existsBy({ id: localityId }))) {
      throw new BadRequestException({ code: 'INVALID_PLACE', message: 'La localidad no existe.' });
    }
    if (neighborhoodId) {
      const ok = await manager.getRepository(Neighborhood).existsBy({
        id: neighborhoodId,
        localityId: localityId!,
        status: NeighborhoodStatus.APPROVED,
      });
      if (!ok) {
        throw new BadRequestException({
          code: 'INVALID_PLACE',
          message: 'El barrio no existe en esa localidad o todavía no está aprobado.',
        });
      }
    }
  }

  private async validProfessions(manager: EntityManager, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const found = await manager.getRepository(Profession).countBy({ id: In(ids), active: true });
    if (found !== ids.length) {
      throw new BadRequestException({
        code: 'INVALID_PROFESSION',
        message: 'Alguna de las profesiones no existe.',
      });
    }
    return ids;
  }

  private async setProfessions(manager: EntityManager, postId: string, ids: string[]) {
    const repository = manager.getRepository(ForumPostProfession);
    await repository.delete({ postId });
    if (ids.length) await repository.insert(ids.map((professionId) => ({ postId, professionId })));
  }

  private async ownPost(manager: EntityManager, userId: string, id: string): Promise<ForumPost> {
    const post = await manager.getRepository(ForumPost).findOne({
      where: { id, authorId: userId, ...LIVE },
      lock: { mode: 'pessimistic_write' },
    });
    if (!post) throw postNotFound();
    return post;
  }

  private async ownReply(manager: EntityManager, userId: string, id: string): Promise<ForumReply> {
    const reply = await manager.getRepository(ForumReply).findOne({
      where: { id, authorId: userId, ...LIVE },
      lock: { mode: 'pessimistic_write' },
    });
    if (!reply) throw replyNotFound();
    return reply;
  }

  /** "Me gusta" idempotente: darlo dos veces o sacarlo sin haberlo dado no falla. */
  private async toggle(
    table: 'forum_post_likes' | 'forum_reply_likes',
    column: 'post_id' | 'reply_id',
    targetId: string,
    userId: string,
    like: boolean,
  ): Promise<void> {
    if (like) {
      await this.dataSource.query(
        `INSERT INTO ${table} (${column}, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [targetId, userId],
      );
    } else {
      await this.dataSource.query(`DELETE FROM ${table} WHERE ${column} = $1 AND user_id = $2`, [
        targetId,
        userId,
      ]);
    }
  }

  private async replyView(id: string): Promise<ForumReplyDto> {
    const reply = await this.dataSource
      .getRepository(ForumReply)
      .findOneOrFail({ where: { id }, relations: { author: true } });
    const authors = await this.authors([reply.author as User]);
    const likes = await this.likeCounts('forum_reply_likes', 'reply_id', [id]);
    return {
      id: reply.id,
      parentReplyId: reply.parentReplyId,
      author: authors.get(reply.authorId) ?? null,
      body: reply.body,
      proposedPrice: reply.proposedPrice,
      removed: false,
      likeCount: likes.get(id) ?? 0,
      edited: reply.editedAt !== null,
      createdAt: reply.createdAt,
    };
  }

  /** Arma las publicaciones con autor, profesiones, zona, fotos y contadores, en pocas consultas. */
  private async toPosts(posts: ForumPost[]): Promise<ForumPostDto[]> {
    if (!posts.length) return [];
    const ids = posts.map((p) => p.id);
    const manager = this.dataSource.manager;
    const users = await manager
      .getRepository(User)
      .findBy({ id: In([...new Set(posts.map((p) => p.authorId))]) });
    const professions = await manager
      .getRepository(ForumPostProfession)
      .find({ where: { postId: In(ids) }, relations: { profession: true } });
    const media = await manager.getRepository(ForumPostMedia).find({
      where: { postId: In(ids) },
      relations: { file: true },
      order: { position: 'ASC' },
    });
    const localities = await manager.getRepository(Locality).findBy({
      id: In(posts.flatMap((p) => (p.localityId ? [p.localityId] : []))),
    });
    const neighborhoods = await manager.getRepository(Neighborhood).findBy({
      id: In(posts.flatMap((p) => (p.neighborhoodId ? [p.neighborhoodId] : []))),
    });
    const replyCounts: Array<{ post_id: string; count: string }> = await manager.query(
      `SELECT post_id, count(*) AS count FROM forum_replies
        WHERE post_id = ANY($1) AND deleted_at IS NULL AND status = 'VISIBLE'
        GROUP BY post_id`,
      [ids],
    );
    const likes = await this.likeCounts('forum_post_likes', 'post_id', ids);
    const authors = await this.authors(users);

    return posts.map((post) => {
      const locality = localities.find((l) => l.id === post.localityId);
      const neighborhood = neighborhoods.find((n) => n.id === post.neighborhoodId);
      return {
        id: post.id,
        type: post.type,
        body: post.body,
        author: authors.get(post.authorId)!,
        professions: professions
          .filter((p) => p.postId === post.id)
          .map((p) => ({ id: p.professionId, name: p.profession?.name ?? '' })),
        locality: locality ? { id: locality.id, name: locality.name } : null,
        neighborhood: neighborhood ? { id: neighborhood.id, name: neighborhood.name } : null,
        budgetEstimate: post.budgetEstimate,
        deadline: post.deadline,
        resolved: post.resolvedAt !== null,
        media: media.flatMap((m) => {
          const url = m.postId === post.id && m.file ? this.uploads.urlOf(m.file) : null;
          return url && m.file ? [{ kind: m.file.kind, url }] : [];
        }),
        likeCount: likes.get(post.id) ?? 0,
        replyCount: Number(replyCounts.find((r) => r.post_id === post.id)?.count ?? 0),
        edited: post.editedAt !== null,
        createdAt: post.createdAt,
      };
    });
  }

  /** Datos públicos del autor (FI §13.1): nombre, apellido, foto y fecha de registro. */
  private async authors(users: User[]): Promise<Map<string, ForumAuthorDto>> {
    const avatars = await this.uploads.publicUrls(
      users.flatMap((u) => (u.avatarFileId ? [u.avatarFileId] : [])),
    );
    return new Map(
      users.map((u) => [
        u.id,
        {
          userId: u.id,
          firstName: u.deletedAt ? 'Usuario' : u.firstName,
          lastName: u.deletedAt ? 'eliminado' : u.lastName,
          avatarUrl: !u.deletedAt && u.avatarFileId ? (avatars.get(u.avatarFileId) ?? null) : null,
          role: u.role,
          memberSince: u.createdAt,
        },
      ]),
    );
  }

  private async likeCounts(
    table: 'forum_post_likes' | 'forum_reply_likes',
    column: 'post_id' | 'reply_id',
    ids: string[],
  ): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows: Array<{ id: string; count: string }> = await this.dataSource.query(
      `SELECT ${column} AS id, count(*) AS count FROM ${table} WHERE ${column} = ANY($1) GROUP BY ${column}`,
      [ids],
    );
    return new Map(rows.map((r) => [r.id, Number(r.count)]));
  }
}

const isLive = (row: { deletedAt: Date | null; status: ContentStatus }) =>
  row.deletedAt === null && row.status === ContentStatus.VISIBLE;
