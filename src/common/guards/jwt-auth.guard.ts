import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser, IS_PUBLIC_KEY } from '../decorators';

/**
 * Autenticación por la cookie del access token (estrategia `jwt`, ver JwtStrategy). Deniega por
 * defecto: solo las rutas con `@Public()` pasan sin usuario.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (!err && user) return user;
    // El frontend usa este código para refrescar la sesión y reintentar una sola vez.
    if (info instanceof Error && info.name === 'TokenExpiredError') {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_EXPIRED',
        message: 'La sesión expiró. Renovala.',
      });
    }
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Iniciá sesión.' });
  }
}
