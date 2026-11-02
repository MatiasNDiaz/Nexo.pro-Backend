import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomInt, randomUUID } from 'crypto';
import { generate } from 'otplib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { UserMfaSettings } from '../../src/auth/entities/user-mfa-settings.entity';
import { createMfaEnrollment } from '../../src/auth/mfa-secrets';
import { encryptField } from '../../src/common/crypto/crypto.utils';
import { type SecurityConfig, securityConfig } from '../../src/config/security.config';
import { MAIL_PROVIDER } from '../../src/integrations/mail/mail-provider';
import type { MemoryMailProvider } from '../../src/integrations/mail/memory-mail.provider';
import { User } from '../../src/users/entities/user.entity';
import { AccountStatus, UserRole } from '../../src/users/user.enums';
import * as argon2 from 'argon2';

export const FRONTEND = 'http://localhost:3000';
export const PASSWORD = 'una-frase-larga-segura';

/** IP simulada (TRUST_PROXY=1 en tests): cada cliente tiene su propio contador de rate limit. */
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/**
 * Cliente con cookie jar propio (un "navegador"), Origin y X-Requested-With por defecto, como el
 * cliente fetch del frontend. El token CSRF se guarda "en memoria", igual que en Next.js.
 */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  csrfToken = '';

  constructor(app: NestExpressApplication, ip = randomIp()) {
    this.agent = request
      .agent(app.getHttpServer())
      .set('Origin', FRONTEND)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('X-Forwarded-For', ip);
  }

  get(path: string) {
    return this.agent.get(`/api/v1${path}`);
  }

  /** POST/DELETE con el token CSRF actual (como el cliente del frontend). */
  post(path: string, body?: object) {
    return this.agent
      .post(`/api/v1${path}`)
      .set('X-CSRF-Token', this.csrfToken)
      .send(body ?? {});
  }

  delete(path: string) {
    return this.agent.delete(`/api/v1${path}`).set('X-CSRF-Token', this.csrfToken);
  }

  async login(email: string, password = PASSWORD) {
    const res = await this.post('/auth/login', { email, password });
    if (res.status === 200 && typeof res.body.csrfToken === 'string')
      this.csrfToken = res.body.csrfToken;
    return res;
  }
}

export function mailbox(app: NestExpressApplication): MemoryMailProvider {
  return app.get<MemoryMailProvider>(MAIL_PROVIDER);
}

/** Token del último email enviado a esa dirección (`...?token=XYZ`). */
export function lastMailToken(app: NestExpressApplication, email: string): string {
  const text = mailbox(app).lastTo(email)?.text ?? '';
  const token = /[?&]token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
  if (!token) throw new Error(`No hay un enlace con token en el último email a ${email}`);
  return token;
}

export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID().slice(0, 8)}@example.com`;

export async function cordobaLocalityId(client: Client): Promise<string> {
  const provinces = await client.get('/locations/provinces');
  const province = (provinces.body as Array<{ id: string; name: string }>).find(
    (p) => p.name === 'Córdoba',
  );
  const localities = await client.get(`/locations/localities?provinceId=${province?.id}`);
  return (localities.body as Array<{ id: string }>)[0]?.id ?? '';
}

export async function professionId(client: Client): Promise<string> {
  const res = await client.get('/professions');
  return (res.body as Array<{ id: string }>)[0]?.id ?? '';
}

export function customerPayload(email: string, localityId: string, neighborhood = 'Nueva Córdoba') {
  return {
    role: 'CUSTOMER',
    email,
    password: PASSWORD,
    firstName: 'Ana',
    lastName: 'Pérez',
    phone: '+54 9 351 123-4567',
    neighborhood: { localityId, name: neighborhood },
  };
}

/** Registra un cliente y devuelve su email. La cuenta queda PENDING_VERIFICATION. */
export async function registerCustomer(
  app: NestExpressApplication,
  overrides: { email?: string; neighborhood?: string } = {},
) {
  const client = new Client(app);
  const email = overrides.email ?? uniqueEmail('cliente');
  const localityId = await cordobaLocalityId(client);
  const res = await client.post(
    '/auth/register',
    customerPayload(email, localityId, overrides.neighborhood),
  );
  if (res.status !== 202)
    throw new Error(`Registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  return email;
}

export async function setStatus(dataSource: DataSource, email: string, status: AccountStatus) {
  await dataSource.getRepository(User).update({ email }, { status });
}

/** Admin con TOTP, creado directo en la base (en producción lo crea `npm run admin:create`). */
export async function createAdmin(app: NestExpressApplication) {
  const dataSource = app.get(DataSource);
  const security = app.get<SecurityConfig>(securityConfig.KEY);
  const email = uniqueEmail('admin');
  const password = 'admin-password-muy-larga';
  const enrollment = createMfaEnrollment(email);
  // Un admin por test: la regla "un solo admin" la impone el CLI, no la base.
  const admin = dataSource.getRepository(User).create({
    email,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    role: UserRole.ADMIN,
    status: AccountStatus.ACTIVE,
    firstName: 'Admin',
    lastName: 'Nexo',
    phone: '+5493510000000',
    emailVerifiedAt: new Date(),
  });
  await dataSource.getRepository(User).insert(admin);
  await dataSource.getRepository(UserMfaSettings).insert({
    userId: admin.id,
    totpSecretEncrypted: encryptField(
      enrollment.secret,
      security.encryptionKey,
      security.encryptionKeyVersion,
    ),
    recoveryCodeHashes: enrollment.recoveryCodeHashes,
    enabledAt: new Date(),
  });
  return {
    id: admin.id,
    email,
    password,
    enrollment,
    totp: () => generate({ secret: enrollment.secret }),
  };
}

/** Admin con sesión completa (contraseña + TOTP) y el token CSRF cargado. */
export async function signInAdmin(app: NestExpressApplication) {
  const admin = await createAdmin(app);
  const client = new Client(app);
  await client.login(admin.email, admin.password);
  const res = await client.post('/auth/mfa/verify', { code: await admin.totp() });
  if (res.status !== 200) throw new Error(`MFA falló: ${res.status}`);
  client.csrfToken = (res.body as { csrfToken: string }).csrfToken;
  return { admin, client };
}

/** Cliente registrado, en el estado pedido y con sesión iniciada. */
export async function signInCustomer(
  app: NestExpressApplication,
  status: AccountStatus = AccountStatus.ACTIVE,
) {
  const email = await registerCustomer(app);
  await setStatus(app.get(DataSource), email, status);
  const client = new Client(app);
  const res = await client.login(email);
  if (res.status !== 200) throw new Error(`Login falló: ${res.status}`);
  const me = await client.get('/auth/me');
  return { client, email, id: (me.body as { id: string }).id };
}

/** Parsea los Set-Cookie de una respuesta: nombre → atributos (en minúsculas). */
export function parseSetCookies(header: string[] | string | undefined) {
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const cookies = new Map<string, { value: string; attributes: Record<string, string | true> }>();
  for (const raw of list) {
    const [pair, ...parts] = raw.split(';').map((part) => part.trim());
    const [name, ...value] = (pair ?? '').split('=');
    const attributes: Record<string, string | true> = {};
    for (const part of parts) {
      const [key, attrValue] = part.split('=');
      attributes[(key ?? '').toLowerCase()] = attrValue ?? true;
    }
    cookies.set(name ?? '', { value: value.join('='), attributes });
  }
  return cookies;
}
