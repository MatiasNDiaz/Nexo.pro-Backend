import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomToken } from '../../common/crypto/crypto.utils';
import { UserRole } from '../../users/user.enums';

/** Parámetros mínimos de OWASP para argon2id (plan §9.9). Los usa también el CLI de admin. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MAX_LENGTH = 128;
/** ADR 0011: 8 para clientes y profesionales, 12 para el admin. Sin reglas de composición. */
export const PASSWORD_MIN_LENGTH = { user: 8, admin: 12 } as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Hash de una contraseña al azar: se verifica contra él cuando el email no existe. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomToken());
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  /** Nunca lanza: un hash corrupto cuenta como contraseña incorrecta. */
  /** Sin hash (cuenta solo Google, ADR 0023): mismo costo que una verificación real y false. */
  async verify(hash: string | null, plain: string): Promise<boolean> {
    if (hash === null) return this.verifyDummy(plain);
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Mismo costo que una verificación real, para no revelar por tiempo si el email existe. */
  async verifyDummy(plain: string): Promise<false> {
    await this.verify(this.dummyHash, plain);
    return false;
  }

  /** Reglas que dependen del contexto (rol, email); el largo máximo también lo valida el DTO. */
  assertAcceptable(password: string, context: { role: UserRole; email: string }): void {
    const min =
      context.role === UserRole.ADMIN ? PASSWORD_MIN_LENGTH.admin : PASSWORD_MIN_LENGTH.user;
    const problem =
      password.length < min || password.length > PASSWORD_MAX_LENGTH
        ? `La contraseña debe tener entre ${min} y ${PASSWORD_MAX_LENGTH} caracteres.`
        : password.trim().toLowerCase() === context.email.toLowerCase()
          ? 'La contraseña no puede ser igual a tu email.'
          : null;
    if (problem) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: problem,
        details: [{ field: 'password', errors: [problem] }],
      });
    }
  }
}
