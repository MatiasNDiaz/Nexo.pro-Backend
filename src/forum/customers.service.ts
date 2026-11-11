import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UploadsService } from '../uploads/uploads.service';
import type {
  CustomerCardDto,
  CustomerDirectoryPageDto,
  CustomerDirectoryQueryDto,
  NamedRefDto,
} from './dto/forum.dto';

/** Publicación visible del alias `p` (ni borrada por su autor ni oculta por el admin). */
const LIVE_POST = `p.deleted_at IS NULL AND p.status = 'VISIBLE'`;

/** Quién aparece: clientes con la cuenta activa (ni suspendidos, ni bloqueados, ni dados de baja). */
const LISTED = `u.role = 'CUSTOMER' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`;

interface CardRow {
  id: string;
  first_name: string;
  last_name: string;
  avatar_file_id: string | null;
  created_at: Date;
  post_count: string;
  open_requests: string;
  last_post_at: Date | null;
  total: string;
}

interface RefRow {
  author_id: string;
  id: string;
  name: string;
}

/** `%` y `_` del texto buscado se toman literal en el ILIKE. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Catálogo de clientes para profesionales (pedido del fundador del 2026-11-11, ADR 0037): todos los
 * clientes activos, publiquen o no, con lo mismo que el foro ya muestra de ellos (nombre, foto y
 * desde cuándo están) más un resumen de sus publicaciones. Nunca teléfono, email ni barrio de la
 * cuenta. Primero los que publicaron hace menos.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  async list(query: CustomerDirectoryQueryDto): Promise<CustomerDirectoryPageDto> {
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const filters: string[] = [];
    if (query.q) {
      filters.push(`(u.first_name || ' ' || u.last_name) ILIKE ${param(likePattern(query.q))}`);
    }
    if (query.professionId) {
      filters.push(`EXISTS (SELECT 1 FROM forum_posts p
        JOIN forum_post_professions fp ON fp.post_id = p.id
        WHERE p.author_id = u.id AND ${LIVE_POST} AND fp.profession_id = ${param(query.professionId)})`);
    }
    if (query.localityId) {
      filters.push(`EXISTS (SELECT 1 FROM forum_posts p
        WHERE p.author_id = u.id AND ${LIVE_POST} AND p.locality_id = ${param(query.localityId)})`);
    }
    if (query.withOpenRequests) {
      filters.push(`EXISTS (SELECT 1 FROM forum_posts p WHERE p.author_id = u.id AND ${LIVE_POST}
        AND p.type = 'PROFESSIONAL_WANTED' AND p.resolved_at IS NULL)`);
    }
    const limit = param(query.limit);
    const offset = param((query.page - 1) * query.limit);
    const rows: CardRow[] = await this.dataSource.query(
      `${this.cardSelect()}, count(*) OVER () AS total
         FROM users u
         ${this.cardJoin()}
        WHERE ${LISTED} ${filters.map((f) => `AND ${f}`).join(' ')}
        ORDER BY s.last_post_at DESC NULLS LAST, u.created_at DESC, u.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return {
      data: await this.toCards(rows),
      page: query.page,
      limit: query.limit,
      total: rows[0] ? Number(rows[0].total) : 0,
    };
  }

  /** La tarjeta de un cliente; 404 si no está en el catálogo (no existe, no es cliente o no está activo). */
  async card(userId: string): Promise<CustomerCardDto> {
    const rows: CardRow[] = await this.dataSource.query(
      `${this.cardSelect()}, 1 AS total FROM users u ${this.cardJoin()} WHERE ${LISTED} AND u.id = $1`,
      [userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Ese cliente no está disponible.',
      });
    }
    const [card] = await this.toCards(rows);
    return card;
  }

  private cardSelect(): string {
    return `SELECT u.id, u.first_name, u.last_name, u.avatar_file_id, u.created_at,
                   s.post_count, s.open_requests, s.last_post_at`;
  }

  /** Resumen de sus publicaciones visibles (una sola pasada por las del usuario). */
  private cardJoin(): string {
    return `CROSS JOIN LATERAL (
      SELECT count(*) AS post_count,
             count(*) FILTER (WHERE p.type = 'PROFESSIONAL_WANTED' AND p.resolved_at IS NULL) AS open_requests,
             max(p.created_at) AS last_post_at
        FROM forum_posts p WHERE p.author_id = u.id AND ${LIVE_POST}) s`;
  }

  private async toCards(rows: CardRow[]): Promise<CustomerCardDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [professions, localities, avatars] = await Promise.all([
      this.dataSource.query<RefRow[]>(
        `SELECT DISTINCT p.author_id, pr.id, pr.name
           FROM forum_posts p
           JOIN forum_post_professions fp ON fp.post_id = p.id
           JOIN professions pr ON pr.id = fp.profession_id
          WHERE p.author_id = ANY($1) AND ${LIVE_POST}
          ORDER BY pr.name`,
        [ids],
      ),
      this.dataSource.query<RefRow[]>(
        `SELECT DISTINCT p.author_id, l.id, l.name
           FROM forum_posts p
           JOIN localities l ON l.id = p.locality_id
          WHERE p.author_id = ANY($1) AND ${LIVE_POST}
          ORDER BY l.name`,
        [ids],
      ),
      this.uploads.publicUrls(rows.flatMap((r) => (r.avatar_file_id ? [r.avatar_file_id] : []))),
    ]);
    const refsOf = (list: RefRow[], userId: string): NamedRefDto[] =>
      list.filter((r) => r.author_id === userId).map((r) => ({ id: r.id, name: r.name }));
    return rows.map((row) => ({
      userId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      avatarUrl: row.avatar_file_id ? (avatars.get(row.avatar_file_id) ?? null) : null,
      memberSince: row.created_at,
      postCount: Number(row.post_count),
      openRequestCount: Number(row.open_requests),
      lastPostAt: row.last_post_at,
      professions: refsOf(professions, row.id),
      localities: refsOf(localities, row.id),
    }));
  }
}
