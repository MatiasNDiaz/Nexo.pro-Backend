import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators';
import { type AuthConfig, authConfig } from '../../config/auth.config';
import { SessionsService } from '../services/sessions.service';
import { TokenService } from '../services/token.service';

interface AccessTokenPayload {
  sub?: unknown;
  sid?: unknown;
}

/** Lee el `kid` del header sin verificar (solo para elegir el secreto con el que se verifica). */
function keyIdFrom(rawJwt: string): unknown {
  try {
    const header = JSON.parse(
      Buffer.from(rawJwt.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as {
      kid?: unknown;
    };
    return header.kid;
  } catch {
    return undefined;
  }
}

/**
 * Access token SOLO desde la cookie HttpOnly (no del header Authorization). Algoritmo fijo HS256,
 * `iss` y `aud` obligatorios. Después de la firma confirma en la base que la sesión `sid` siga
 * viva y carga rol y estado reales del usuario.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(authConfig.KEY) config: AuthConfig,
    tokens: TokenService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        const value: unknown = req.cookies?.[config.cookies.names.access];
        return typeof value === 'string' ? value : null;
      },
      secretOrKeyProvider: (
        _req: Request,
        rawJwt: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        const secret = tokens.secretForKid(keyIdFrom(rawJwt));
        if (secret) done(null, secret);
        else done(new UnauthorizedException());
      },
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      ignoreExpiration: false,
      jsonWebTokenOptions: { clockTolerance: 30 },
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedException();
    }
    const user = await this.sessions.resolveAuthUser(payload.sid, payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
