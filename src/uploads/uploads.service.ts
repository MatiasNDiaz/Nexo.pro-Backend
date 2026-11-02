import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, LessThan, Not } from 'typeorm';
import type { AuthUser } from '../common/decorators';
import { LocalStorageProvider } from '../integrations/storage/local-storage.provider';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  type StoredObjectInfo,
} from '../integrations/storage/storage.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { User } from '../users/entities/user.entity';
import type { CreateUploadDto, CreateUploadResponseDto, FileResponseDto } from './dto/uploads.dto';
import { StoredFile } from './entities/stored-file.entity';
import {
  ALLOWED_MIME_TYPES,
  FILE_POLICIES,
  MAX_PENDING_UPLOADS_PER_USER,
  MAX_VIDEO_DURATION_MS,
  PENDING_UPLOAD_TTL_MS,
} from './file-policies';
import { FileKind, FilePurpose, FileStatus, FileVisibility } from './file.enums';

const notFound = () =>
  new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'El archivo no existe.' });

const TYPE_MESSAGES: Record<FileKind, string> = {
  [FileKind.IMAGE]: 'La imagen tiene que ser JPG, PNG o WebP.',
  [FileKind.VIDEO]: 'El video tiene que ser MP4 o MOV.',
  [FileKind.DOCUMENT]: 'El documento tiene que ser PDF.',
};

/** Rechazo de una subida: el archivo pasa a REJECTED y su binario se borra. */
interface Rejection {
  status: HttpStatus;
  code: string;
  message: string;
}

/** Sin prueba ni plan vigente no se carga contenido profesional (FI §6.5). */
export const subscriptionRequired = () =>
  new ForbiddenException({
    code: 'SUBSCRIPTION_REQUIRED',
    message: 'Necesitás una prueba o un plan vigente para cargar contenido.',
  });

/**
 * Archivos (ADR 0018). Flujo: (1) `create` registra el archivo y devuelve un ticket para subir
 * directo al proveedor; (2) el navegador sube; (3) `complete` consulta al proveedor lo que realmente
 * se guardó y lo valida (tipo real, peso, duración). Recién READY se puede usar.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly subscriptions: SubscriptionsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async create(user: AuthUser, dto: CreateUploadDto): Promise<CreateUploadResponseDto> {
    const policy = FILE_POLICIES[dto.purpose];
    if (!policy.roles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FILE_PURPOSE_NOT_ALLOWED',
        message: 'Tu cuenta no puede subir este tipo de archivo.',
      });
    }
    if (!policy.kinds.includes(dto.kind)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_KIND',
        message: `Para ${dto.purpose} solo se admite: ${policy.kinds.join(', ')}.`,
      });
    }
    const maxBytes = await this.maxBytesFor(user.id, dto.purpose, dto.kind);
    if (maxBytes <= 0) {
      throw new ForbiddenException({
        code: 'FILE_KIND_NOT_IN_PLAN',
        message: 'Tu plan no incluye este tipo de archivo.',
      });
    }

    const repository = this.dataSource.getRepository(StoredFile);
    const pending = await repository.countBy({
      ownerUserId: user.id,
      status: FileStatus.PENDING_UPLOAD,
    });
    if (pending >= MAX_PENDING_UPLOADS_PER_USER) {
      throw new HttpException(
        {
          code: 'TOO_MANY_PENDING_UPLOADS',
          message: 'Tenés demasiadas subidas sin terminar. Probá de nuevo más tarde.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = randomUUID();
    await repository.insert(
      repository.create({
        id,
        ownerUserId: user.id,
        provider: this.storage.code,
        storageKey: this.storage.storageKeyFor(policy.folder, id),
        purpose: dto.purpose,
        kind: dto.kind,
        visibility: policy.visibility,
        status: FileStatus.PENDING_UPLOAD,
      }),
    );
    const saved = await repository.findOneByOrFail({ id });
    const ticket = this.storage.createUploadTicket({
      storageKey: saved.storageKey,
      kind: saved.kind,
    });
    return { file: this.toResponse(saved), upload: { ...ticket, maxBytes } };
  }

  /** Confirma la subida. Idempotente: un archivo ya READY se devuelve tal cual. */
  async complete(user: AuthUser, fileId: string): Promise<FileResponseDto> {
    const repository = this.dataSource.getRepository(StoredFile);
    const file = await this.findOwn(user.id, fileId);
    if (file.status === FileStatus.READY) return this.toResponse(file);
    this.assertPending(file);

    // La consulta al proveedor va fuera de cualquier transacción; las actualizaciones son
    // condicionales (`status = PENDING_UPLOAD`) para que dos confirmaciones no se pisen.
    const info = await this.storage.inspect(file.storageKey, file.kind);
    if (!info) {
      throw new ConflictException({
        code: 'UPLOAD_NOT_RECEIVED',
        message: 'Todavía no recibimos el archivo. Subilo y volvé a confirmar.',
      });
    }

    const maxBytes = await this.maxBytesFor(user.id, file.purpose, file.kind);
    const rejection = this.validate(file, info, maxBytes);
    if (rejection) {
      const result = await repository.update(
        { id: file.id, status: FileStatus.PENDING_UPLOAD },
        { status: FileStatus.REJECTED, mimeType: info.mimeType, sizeBytes: info.sizeBytes },
      );
      if (result.affected) await this.deleteFromStorage([file]);
      throw new HttpException(
        { code: rejection.code, message: rejection.message },
        rejection.status,
      );
    }

    const result = await repository.update(
      { id: file.id, status: FileStatus.PENDING_UPLOAD },
      {
        status: FileStatus.READY,
        mimeType: info.mimeType,
        sizeBytes: info.sizeBytes,
        durationMs: info.durationMs,
      },
    );
    const current = await repository.findOneByOrFail({ id: file.id });
    if (!result.affected && current.status !== FileStatus.READY) this.assertPending(current);
    return this.toResponse(current);
  }

  /**
   * Bloquea un archivo propio, confirmado y del propósito pedido, para usarlo (foto, medio,
   * certificado). Corre en la transacción del llamador.
   */
  async lockReadyFile(
    manager: EntityManager,
    userId: string,
    fileId: string,
    purpose: FilePurpose,
  ): Promise<StoredFile> {
    const file = await manager
      .getRepository(StoredFile)
      .findOne({ where: { id: fileId }, lock: { mode: 'pessimistic_write' } });
    if (!file || file.ownerUserId !== userId) throw notFound();
    if (file.purpose !== purpose) {
      throw new BadRequestException({
        code: 'WRONG_FILE_PURPOSE',
        message: 'Ese archivo se subió para otro uso.',
      });
    }
    if (file.status !== FileStatus.READY) {
      throw new ConflictException({
        code: 'FILE_NOT_READY',
        message: 'Confirmá la subida antes de usar el archivo.',
      });
    }
    return file;
  }

  /** Marca DELETED (en la transacción del llamador); el binario se borra después del commit. */
  async markDeleted(manager: EntityManager, fileIds: string[]): Promise<StoredFile[]> {
    if (!fileIds.length) return [];
    const files = await manager.getRepository(StoredFile).findBy({ id: In(fileIds) });
    await manager
      .getRepository(StoredFile)
      .update({ id: In(fileIds) }, { status: FileStatus.DELETED });
    return files;
  }

  /** Foto de perfil pública y, si hay, la foto nueva en revisión (ADR 0019). */
  async avatarUrls(user: {
    avatarFileId: string | null;
    pendingAvatarFileId: string | null;
  }): Promise<{ avatarUrl: string | null; pendingAvatarUrl: string | null }> {
    const ids = [user.avatarFileId, user.pendingAvatarFileId].filter((id) => id !== null);
    const urls = await this.publicUrls(ids);
    return {
      avatarUrl: user.avatarFileId ? (urls.get(user.avatarFileId) ?? null) : null,
      pendingAvatarUrl: user.pendingAvatarFileId
        ? (urls.get(user.pendingAvatarFileId) ?? null)
        : null,
    };
  }

  /** URLs públicas de varios archivos en una sola consulta (los que no estén listos no aparecen). */
  async publicUrls(fileIds: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (!fileIds.length) return urls;
    const files = await this.dataSource.getRepository(StoredFile).findBy({ id: In(fileIds) });
    for (const file of files) {
      const url = this.urlOf(file);
      if (url) urls.set(file.id, url);
    }
    return urls;
  }

  /** Subida al adaptador local (solo desarrollo y tests). */
  async storeLocalContent(user: AuthUser, fileId: string, data: Buffer): Promise<void> {
    const local = this.localStorage();
    const file = await this.findOwn(user.id, fileId);
    this.assertPending(file);
    const maxBytes = await this.maxBytesFor(user.id, file.purpose, file.kind);
    if (data.length > maxBytes) throw this.tooLarge(maxBytes);
    await local.write(file.storageKey, data);
  }

  /** Contenido de un archivo público del adaptador local (solo desarrollo y tests). */
  async readLocalPublic(fileId: string): Promise<{ data: Buffer; mimeType: string }> {
    const local = this.localStorage();
    const file = await this.dataSource.getRepository(StoredFile).findOneBy({
      id: fileId,
      status: FileStatus.READY,
      visibility: FileVisibility.PUBLIC,
    });
    const data = file ? await local.read(file.storageKey) : null;
    if (!file?.mimeType || !data) throw notFound();
    return { data, mimeType: file.mimeType };
  }

  /**
   * Descarta las subidas que nunca se confirmaron (las corre un job horario). Primero las marca
   * DELETED (condicional) y recién después borra el binario: una confirmación simultánea no puede
   * dejar READY un archivo borrado. Devuelve cuántas descartó.
   */
  async discardStalePendingUploads(now = new Date(), batchSize = 100): Promise<number> {
    const repository = this.dataSource.getRepository(StoredFile);
    const stale = await repository.find({
      where: {
        status: FileStatus.PENDING_UPLOAD,
        createdAt: LessThan(new Date(now.getTime() - PENDING_UPLOAD_TTL_MS)),
      },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });
    const discarded: StoredFile[] = [];
    for (const file of stale) {
      const result = await repository.update(
        { id: file.id, status: FileStatus.PENDING_UPLOAD },
        { status: FileStatus.DELETED },
      );
      if (result.affected) discarded.push(file);
    }
    await this.deleteFromStorage(discarded);
    return discarded.length;
  }

  /**
   * Marca DELETED todos los archivos de un usuario y le quita la foto (anonimización, ADR 0013).
   * Corre en la transacción del llamador; los binarios se borran después con `deleteFromStorage`.
   */
  async detachAllFrom(manager: EntityManager, userId: string): Promise<StoredFile[]> {
    await manager
      .getRepository(User)
      .update(userId, { avatarFileId: null, pendingAvatarFileId: null });
    const files = await manager.getRepository(StoredFile).findBy({
      ownerUserId: userId,
      status: Not(In([FileStatus.DELETED, FileStatus.REJECTED])),
    });
    if (files.length) {
      await manager
        .getRepository(StoredFile)
        .update({ id: In(files.map((f) => f.id)) }, { status: FileStatus.DELETED });
    }
    return files;
  }

  /** Borra binarios del proveedor. Un fallo no corta el flujo: queda en el log para reintentarlo. */
  async deleteFromStorage(files: StoredFile[]): Promise<void> {
    for (const file of files) {
      try {
        await this.storage.delete(file.storageKey, file.kind);
      } catch {
        this.logger.warn(`No se pudo borrar del almacenamiento el archivo ${file.id}`);
      }
    }
  }

  toResponse(file: StoredFile): FileResponseDto {
    return {
      id: file.id,
      purpose: file.purpose,
      kind: file.kind,
      status: file.status,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      durationMs: file.durationMs,
      url: this.urlOf(file),
      createdAt: file.createdAt,
    };
  }

  urlOf(file: StoredFile): string | null {
    if (file.status !== FileStatus.READY || file.visibility !== FileVisibility.PUBLIC) return null;
    return this.storage.publicUrl(file.storageKey, file.kind, file.id);
  }

  /** Peso máximo para ese usuario. Lanza 403 si el propósito exige plan y no tiene uno vigente. */
  private async maxBytesFor(userId: string, purpose: FilePurpose, kind: FileKind) {
    const policy = FILE_POLICIES[purpose];
    if (!policy.needsPlan) return policy.maxBytes(kind, null);
    const plan = await this.subscriptions.livePlan(userId);
    if (!plan) throw subscriptionRequired();
    return policy.maxBytes(kind, plan);
  }

  private validate(file: StoredFile, info: StoredObjectInfo, maxBytes: number): Rejection | null {
    if (!info.mimeType || !ALLOWED_MIME_TYPES[file.kind].includes(info.mimeType)) {
      return {
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: 'UNSUPPORTED_FILE_TYPE',
        message: TYPE_MESSAGES[file.kind],
      };
    }
    if (info.sizeBytes > maxBytes) {
      const { code, message } = this.tooLarge(maxBytes).getResponse() as Rejection;
      return { status: HttpStatus.PAYLOAD_TOO_LARGE, code, message };
    }
    if (
      file.kind === FileKind.VIDEO &&
      (info.durationMs === null || info.durationMs > MAX_VIDEO_DURATION_MS)
    ) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'VIDEO_TOO_LONG',
        message: 'El video puede durar hasta 15 segundos.',
      };
    }
    return null;
  }

  private tooLarge(maxBytes: number): HttpException {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return new HttpException(
      { code: 'FILE_TOO_LARGE', message: `El archivo puede pesar hasta ${mb} MB.` },
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }

  private assertPending(file: StoredFile): void {
    if (file.status !== FileStatus.PENDING_UPLOAD) {
      throw new ConflictException({
        code: 'FILE_NOT_PENDING',
        message: 'Ese archivo ya no admite subidas. Empezá una nueva.',
      });
    }
  }

  /** Un archivo ajeno responde igual que uno inexistente (no revela ids de otros). */
  private async findOwn(userId: string, fileId: string): Promise<StoredFile> {
    const file = await this.dataSource.getRepository(StoredFile).findOneBy({ id: fileId });
    if (!file || file.ownerUserId !== userId) throw notFound();
    return file;
  }

  private localStorage(): LocalStorageProvider {
    if (!(this.storage instanceof LocalStorageProvider)) throw notFound();
    return this.storage;
  }
}
