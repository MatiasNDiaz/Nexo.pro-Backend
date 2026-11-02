import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomToken, sha256Hex } from '../../common/crypto/crypto.utils';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { UserRole } from '../../users/user.enums';

/** Identificador público de un secreto (va en el header `kid`); no revela el secreto. */
export const keyIdOf = (secret: string) => sha256Hex(secret).slice(0, 16);

const MFA_AUDIENCE_SUFFIX = '-mfa';

/**
 * JWT de acceso (HS256, algoritmo fijo) con claims mínimos: sub, sid, iat, exp, iss, aud.
 * Rotación del secreto: se firma con el actual; se verifica con el actual o el anterior según `kid`.
 */
@Injectable()
export class TokenService {
  private readonly secretsByKid: Map<string, string>;
  private readonly currentKid: string;

  constructor(
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {
    this.currentKid = keyIdOf(config.jwt.secret);
    this.secretsByKid = new Map([[this.currentKid, config.jwt.secret]]);
    if (config.jwt.previousSecret) {
      this.secretsByKid.set(keyIdOf(config.jwt.previousSecret), config.jwt.previousSecret);
    }
  }

  secretForKid(kid: unknown): string | undefined {
    return typeof kid === 'string' ? this.secretsByKid.get(kid) : undefined;
  }

  accessTtlFor(role: UserRole): number {
    return role === UserRole.ADMIN
      ? this.config.ttlSec.access.admin
      : this.config.ttlSec.access.user;
  }

  signAccessToken(user: { id: string; role: UserRole }, sid: string): Promise<string> {
    return this.jwt.signAsync(
      { sid },
      {
        secret: this.config.jwt.secret,
        algorithm: 'HS256',
        keyid: this.currentKid,
        subject: user.id,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        expiresIn: this.accessTtlFor(user.role),
      },
    );
  }

  /** Paso intermedio del login del admin: solo sirve para `POST /auth/mfa/verify`. */
  signMfaChallenge(userId: string): Promise<string> {
    return this.jwt.signAsync(
      {},
      {
        secret: this.config.jwt.secret,
        algorithm: 'HS256',
        keyid: this.currentKid,
        subject: userId,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience + MFA_AUDIENCE_SUFFIX,
        expiresIn: this.config.ttlSec.mfaChallenge,
      },
    );
  }

  /** Devuelve el id del usuario o null si el desafío es inválido o venció. */
  async verifyMfaChallenge(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
        secret: this.config.jwt.secret,
        algorithms: ['HS256'],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience + MFA_AUDIENCE_SUFFIX,
      });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /** Refresh opaco de 256 bits. Al cliente va el token; a la base, solo su hash. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomToken();
    return { token, hash: sha256Hex(token) };
  }
}
