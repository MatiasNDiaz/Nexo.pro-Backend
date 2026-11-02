import { Inject, Injectable } from '@nestjs/common';
import { verify } from 'otplib';
import { EntityManager } from 'typeorm';
import { decryptField, sha256Hex } from '../../common/crypto/crypto.utils';
import { type SecurityConfig, securityConfig } from '../../config/security.config';
import { UserMfaSettings } from '../entities/user-mfa-settings.entity';
import { normalizeRecoveryCode } from '../mfa-secrets';

/** Tolerancia de reloj: el código anterior y el siguiente (±30 s) también valen. */
const TOTP_TOLERANCE_SEC = 30;

export interface MfaProof {
  code?: string;
  recoveryCode?: string;
}

@Injectable()
export class MfaService {
  private readonly keys: ReadonlyMap<number, Buffer>;

  constructor(@Inject(securityConfig.KEY) config: SecurityConfig) {
    this.keys = new Map([[config.encryptionKeyVersion, config.encryptionKey]]);
  }

  /**
   * Verifica un código TOTP o de recuperación y actualiza el estado para que no se pueda
   * reutilizar. Debe correr en la transacción del llamador (bloquea la fila).
   */
  async verifyAndConsume(
    manager: EntityManager,
    userId: string,
    proof: MfaProof,
  ): Promise<boolean> {
    const repository = manager.getRepository(UserMfaSettings);
    const settings = await repository.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!settings) return false;

    if (proof.code) {
      const result = await verify({
        secret: decryptField(settings.totpSecretEncrypted, this.keys),
        token: proof.code,
        epochTolerance: TOTP_TOLERANCE_SEC,
        // Rechaza el mismo código (o uno anterior) aunque siga dentro de su ventana de 30 s.
        afterTimeStep: settings.lastUsedStep ?? undefined,
      }).catch(() => ({ valid: false as const }));
      // `timeStep` solo existe en el resultado TOTP (la función también sirve para HOTP).
      const timeStep = result.valid && 'timeStep' in result ? result.timeStep : undefined;
      if (typeof timeStep !== 'number') return false;
      await repository.update(userId, { lastUsedStep: timeStep });
      return true;
    }

    if (proof.recoveryCode) {
      const hash = sha256Hex(normalizeRecoveryCode(proof.recoveryCode));
      if (!settings.recoveryCodeHashes.includes(hash)) return false;
      await repository.update(userId, {
        recoveryCodeHashes: settings.recoveryCodeHashes.filter((stored) => stored !== hash),
      });
      return true;
    }
    return false;
  }
}
