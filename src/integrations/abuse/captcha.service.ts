import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { type AbuseConfig, abuseConfig } from '../../config/abuse.config';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Fallos de login desde una misma IP que activan el CAPTCHA, y por cuánto tiempo se cuentan. */
export const LOGIN_FAILURES_BEFORE_CAPTCHA = 3;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export const captchaRequired = () =>
  new BadRequestException({
    code: 'CAPTCHA_REQUIRED',
    message: 'Completá la verificación para seguir.',
  });

/**
 * CAPTCHA con Cloudflare Turnstile (etapa 12). Apagado sin TURNSTILE_SECRET_KEY: todo pasa. Se
 * pide en el registro, en el formulario de contacto y en el login después de 3 fallos desde la
 * misma IP (por IP y no por cuenta: así no revela qué emails existen). Los fallos se cuentan en
 * memoria (una sola instancia, ver docs/operacion.md).
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly loginFailures = new Map<string, number[]>();
  /** Reemplazable en los tests (sin llamar a Cloudflare). */
  fetchFn: typeof fetch = fetch;

  constructor(@Inject(abuseConfig.KEY) private readonly config: AbuseConfig) {}

  get enabled(): boolean {
    return this.config.turnstileSecret !== '';
  }

  /** Exige un token válido si está activado. */
  async assert(token: string | undefined): Promise<void> {
    if (!this.enabled) return;
    if (!token || !(await this.verify(token))) throw captchaRequired();
  }

  /** En el login: solo después de varios fallos desde esa IP. */
  async assertForLogin(ipKey: string | null, token: string | undefined): Promise<void> {
    if (!this.enabled || !ipKey) return;
    if (this.recentFailures(ipKey, Date.now()) < LOGIN_FAILURES_BEFORE_CAPTCHA) return;
    await this.assert(token);
  }

  recordLoginFailure(ipKey: string | null): void {
    if (!this.enabled || !ipKey) return;
    const now = Date.now();
    const recent = (this.loginFailures.get(ipKey) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    recent.push(now);
    this.loginFailures.set(ipKey, recent);
    // Que el mapa no crezca sin límite con IPs viejas.
    if (this.loginFailures.size > 10_000) {
      for (const [key, times] of this.loginFailures) {
        if (times.every((t) => now - t >= FAILURE_WINDOW_MS)) this.loginFailures.delete(key);
      }
    }
  }

  private recentFailures(ipKey: string, now: number): number {
    return (this.loginFailures.get(ipKey) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS).length;
  }

  /** Si Cloudflare no responde, no se deja pasar (el usuario puede reintentar). */
  private async verify(token: string): Promise<boolean> {
    try {
      const response = await this.fetchFn(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.config.turnstileSecret, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      const result = (await response.json()) as { success?: unknown };
      return result.success === true;
    } catch (error) {
      this.logger.warn(`No se pudo verificar el CAPTCHA: ${String(error)}`);
      return false;
    }
  }
}
