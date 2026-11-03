import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { UploadsService } from '../../uploads/uploads.service';
import type { User } from '../../users/entities/user.entity';
import { CurrentUserDto, type SessionResponseDto } from '../dto/auth-responses.dto';
import { AuthCookiesService } from './auth-cookies.service';
import { CsrfService } from './csrf.service';
import type { IssuedSession } from './sessions.service';
import { TokenService } from './token.service';

const secondsUntil = (date: Date) => Math.max(1, Math.floor((date.getTime() - Date.now()) / 1000));

/**
 * Entrega una sesión recién creada: cookies de access, refresh y CSRF, y el token CSRF en el body.
 * La usan el login con contraseña, el segundo factor del admin y el login con Google.
 */
@Injectable()
export class SessionResponderService {
  constructor(
    private readonly tokens: TokenService,
    private readonly cookies: AuthCookiesService,
    private readonly csrf: CsrfService,
    private readonly uploads: UploadsService,
  ) {}

  async respond(res: Response, user: User, issued: IssuedSession): Promise<SessionResponseDto> {
    const access = await this.tokens.signAccessToken(user, issued.session.id);
    const csrfCookie = this.csrf.newCookieValue();
    this.cookies.set(res, 'access', access, this.tokens.accessTtlFor(user.role));
    this.cookies.set(res, 'refresh', issued.refreshToken, secondsUntil(issued.session.expiresAt));
    this.cookies.set(res, 'csrf', csrfCookie, secondsUntil(issued.session.familyExpiresAt));
    return {
      user: CurrentUserDto.from(user, await this.uploads.avatarUrls(user)),
      csrfToken: this.csrf.tokenFor(issued.session.familyId, csrfCookie),
    };
  }
}
