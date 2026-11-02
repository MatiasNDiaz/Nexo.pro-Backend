import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomToken, sha256Hex } from '../../common/crypto/crypto.utils';
import { OneTimeToken, OneTimeTokenType } from '../entities/one-time-token.entity';

/** Enlaces de un solo uso (verificación de email, reset de contraseña). Plan §9.3 y SEG §14. */
@Injectable()
export class OneTimeTokensService {
  constructor(private readonly dataSource: DataSource) {}

  /** Emite un token nuevo e invalida los anteriores del mismo tipo. Devuelve el token en claro. */
  async issue(
    userId: string,
    type: OneTimeTokenType,
    ttlSec: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const now = new Date();
    await manager
      .createQueryBuilder()
      .update(OneTimeToken)
      .set({ expiresAt: now })
      .where('user_id = :userId AND type = :type AND used_at IS NULL AND expires_at > :now', {
        userId,
        type,
        now,
      })
      .execute();
    const token = randomToken();
    await manager.getRepository(OneTimeToken).insert({
      userId,
      type,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + ttlSec * 1000),
    });
    return token;
  }

  /**
   * Consume el token de forma atómica (un solo UPDATE condicional): dos requests simultáneas con el
   * mismo token no pueden usarlo las dos. Devuelve el id del usuario o null.
   */
  async consume(
    token: string,
    type: OneTimeTokenType,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string | null> {
    const rows: [Array<{ user_id: string }>, number] = await manager.query(
      `UPDATE one_time_tokens SET used_at = now()
       WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [sha256Hex(token), type],
    );
    return rows[0][0]?.user_id ?? null;
  }
}
