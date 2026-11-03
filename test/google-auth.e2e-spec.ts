import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { AuthIdentity } from '../src/auth/entities/auth-identity.entity';
import type { FakeOAuthProvider } from '../src/integrations/oauth/fake-oauth.provider';
import { OAUTH_PROVIDER, type OAuthProfile } from '../src/integrations/oauth/oauth-provider';
import { Subscription } from '../src/subscriptions/entities/subscription.entity';
import { User } from '../src/users/entities/user.entity';
import {
  Client,
  cordobaLocalityId,
  createAdmin,
  lastMailToken,
  PASSWORD,
  professionId,
  registerCustomer,
  uniqueEmail,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

/** ADR 0015 y 0023, con el adaptador simulado de Google. */
describe('Login con Google (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let google: FakeOAuthProvider;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    google = app.get<FakeOAuthProvider>(OAUTH_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  const profile = (overrides: Partial<OAuthProfile> = {}): OAuthProfile => ({
    subject: randomUUID(),
    email: uniqueEmail('google'),
    emailVerified: true,
    givenName: 'Lucía',
    familyName: 'Martínez',
    ...overrides,
  });

  /** "Entrar con Google" en ese navegador: devuelve el resultado que ve el frontend. */
  async function signInWithGoogle(client: Client, account: OAuthProfile) {
    const start = await client.agent.get('/api/v1/auth/google');
    expect(start.status).toBe(302);
    const callback = google.authorize(start.headers.location, account);
    const res = await client.agent.get(callback.pathname + callback.search);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe('/ingresar/google');
    return {
      result: location.searchParams.get('resultado'),
      code: location.searchParams.get('codigo'),
      callback,
    };
  }

  async function customerData(client: Client) {
    return {
      role: 'CUSTOMER',
      firstName: 'Lucía',
      lastName: 'Martínez',
      phone: '3517778888',
      // Nombre propio de este archivo: otros tests crean barrios conocidos a mano.
      neighborhood: { localityId: await cordobaLocalityId(client), name: 'Barrio Google E2e' },
    };
  }

  const audits = (targetId: string, action: string) =>
    dataSource.getRepository(AdminAuditLog).countBy({ targetId, action });

  describe('cuenta nueva', () => {
    it('completa los mismos datos obligatorios y queda pendiente de verificación, sin contraseña', async () => {
      const client = new Client(app);
      const account = profile();
      expect((await signInWithGoogle(client, account)).result).toBe('signup');

      const pending = await client.get('/auth/google/pending');
      expect(pending.body).toEqual({
        kind: 'SIGNUP',
        email: account.email,
        firstName: 'Lucía',
        lastName: 'Martínez',
      });
      expect((await client.post('/auth/google/register', { role: 'CUSTOMER' })).status).toBe(400);

      const res = await client.post('/auth/google/register', await customerData(client));
      expect(res.status).toBe(201);
      client.csrfToken = res.body.csrfToken as string;
      const me = (await client.get('/auth/me')).body;
      expect(me).toMatchObject({
        email: account.email,
        status: 'PENDING_VERIFICATION',
        emailVerified: true,
        hasPassword: false,
        googleLinked: true,
      });
      expect(await audits(me.id as string, 'USER_REGISTERED')).toBe(1);

      // La próxima vez entra directo, desde otro navegador.
      const again = new Client(app);
      expect((await signInWithGoogle(again, account)).result).toBe('session');
      expect((await again.get('/auth/me')).body.id).toBe(me.id);
      // El pedido ya se usó.
      expect((await client.get('/auth/google/pending')).status).toBe(401);
    });

    it('un profesional nuevo recibe su prueba de 30 días', async () => {
      const client = new Client(app);
      await signInWithGoogle(client, profile());
      const res = await client.post('/auth/google/register', {
        role: 'PROFESSIONAL',
        firstName: 'Lucía',
        lastName: 'Martínez',
        phone: '3517778888',
        professionId: await professionId(client),
        serviceAreas: [{ localityId: await cordobaLocalityId(client) }],
      });
      expect(res.status).toBe(201);
      const userId = res.body.user.id as string;
      expect(
        (await dataSource.getRepository(Subscription).findOneByOrFail({ userId })).status,
      ).toBe('TRIAL');
    });

    it('si el email se registró mientras tanto, no crea otra cuenta', async () => {
      const client = new Client(app);
      const account = profile();
      await signInWithGoogle(client, account);
      await registerCustomer(app, { email: account.email });
      const res = await client.post('/auth/google/register', await customerData(client));
      expect(res.status).toBe(409);
      expect(await dataSource.getRepository(User).countBy({ email: account.email })).toBe(1);
    });
  });

  describe('email que ya tiene cuenta (no se vincula solo)', () => {
    it('vincula con la contraseña correcta; con la incorrecta no', async () => {
      const email = await registerCustomer(app);
      const client = new Client(app);
      const account = profile({ email });
      expect((await signInWithGoogle(client, account)).result).toBe('link');
      expect((await client.get('/auth/google/pending')).body.kind).toBe('LINK');
      expect((await client.get('/auth/me')).status).toBe(401);

      const wrong = await client.post('/auth/google/link', { password: 'no-es-la-clave' });
      expect(wrong.status).toBe(401);
      const user = await dataSource.getRepository(User).findOneByOrFail({ email });
      expect(await dataSource.getRepository(AuthIdentity).countBy({ userId: user.id })).toBe(0);

      const ok = await client.post('/auth/google/link', { password: PASSWORD });
      expect(ok.status).toBe(200);
      expect(await audits(user.id, 'GOOGLE_LINKED')).toBe(1);
      expect((await signInWithGoogle(new Client(app), account)).result).toBe('session');
    });

    it('vincula con el enlace por email (sirve una sola vez, aunque sea otro navegador)', async () => {
      const email = await registerCustomer(app);
      const client = new Client(app);
      await signInWithGoogle(client, profile({ email }));
      expect((await client.post('/auth/google/link/email')).status).toBe(202);
      const token = lastMailToken(app, email);

      const otherBrowser = new Client(app);
      const res = await otherBrowser.post('/auth/google/link/confirm', { token });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
      expect((await new Client(app).post('/auth/google/link/confirm', { token })).status).toBe(401);
    });

    it('el admin nunca entra con Google', async () => {
      const admin = await createAdmin(app);
      const res = await signInWithGoogle(new Client(app), profile({ email: admin.email }));
      expect(res).toMatchObject({ result: 'error', code: 'GOOGLE_NOT_ALLOWED' });
    });
  });

  describe('validaciones del intercambio', () => {
    it('rechaza emails no verificados por Google', async () => {
      const res = await signInWithGoogle(new Client(app), profile({ emailVerified: false }));
      expect(res).toMatchObject({ result: 'error', code: 'EMAIL_NOT_VERIFIED' });
    });

    it('rechaza un state distinto, un código reutilizado y la falta de cookie', async () => {
      const client = new Client(app);
      const start = await client.agent.get('/api/v1/auth/google');
      const callback = google.authorize(start.headers.location, profile());
      const forged = new URL(callback);
      forged.searchParams.set('state', 'otro-state');
      const tampered = await client.agent.get(forged.pathname + forged.search);
      expect(tampered.headers.location).toContain('codigo=INVALID_STATE');

      const first = await signInWithGoogle(client, profile());
      expect(first.result).toBe('signup');
      // El mismo código otra vez, sin la cookie del intercambio (ya se borró).
      const replay = await client.agent.get(first.callback.pathname + first.callback.search);
      expect(replay.headers.location).toContain('resultado=error');

      const noCookie = await new Client(app).agent.get(callback.pathname + callback.search);
      expect(noCookie.headers.location).toContain('codigo=INVALID_STATE');
      const cancelled = await new Client(app).agent.get(
        '/api/v1/auth/google/callback?error=access_denied',
      );
      expect(cancelled.headers.location).toContain('codigo=CANCELLED');
    });
  });

  describe('cuentas sin contraseña (ADR 0023)', () => {
    /** Cuenta creada con Google, con sesión iniciada en ese navegador. */
    async function googleOnlyAccount() {
      const client = new Client(app);
      const account = profile();
      await signInWithGoogle(client, account);
      const res = await client.post('/auth/google/register', await customerData(client));
      client.csrfToken = res.body.csrfToken as string;
      return { client, account, id: res.body.user.id as string };
    }

    /** Simula que el dispositivo inició sesión hace 11 minutos. */
    const ageSession = (userId: string) =>
      dataSource.query(
        `UPDATE auth_sessions SET created_at = now() - interval '11 minutes' WHERE user_id = $1`,
        [userId],
      );

    it('no entra con contraseña ni la cambia; la crea con un login reciente', async () => {
      const { client, account, id } = await googleOnlyAccount();
      expect((await new Client(app).login(account.email, 'cualquier-cosa-larga')).status).toBe(401);
      const change = await client.post('/auth/password/change', {
        currentPassword: 'x',
        newPassword: 'una-clave-nueva-larga',
      });
      expect(change.body.code).toBe('NO_PASSWORD_SET');

      await ageSession(id);
      const stale = await client.post('/auth/password/set', {
        newPassword: 'una-clave-nueva-larga',
      });
      expect(stale.status).toBe(403);
      expect(stale.body.code).toBe('REAUTH_REQUIRED');

      const fresh = new Client(app);
      await signInWithGoogle(fresh, account);
      fresh.csrfToken = (await fresh.get('/auth/csrf')).body.csrfToken as string;
      expect(
        (await fresh.post('/auth/password/set', { newPassword: 'una-clave-nueva-larga' })).status,
      ).toBe(204);
      expect((await new Client(app).login(account.email, 'una-clave-nueva-larga')).status).toBe(
        200,
      );
      expect(
        (await fresh.post('/auth/password/set', { newPassword: 'otra-clave-nueva-larga' })).body
          .code,
      ).toBe('PASSWORD_ALREADY_SET');
    });

    it('desvincular Google exige tener contraseña', async () => {
      const { client, id } = await googleOnlyAccount();
      const blocked = await client.delete('/auth/google/link');
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('PASSWORD_REQUIRED');

      await client.post('/auth/password/set', { newPassword: 'una-clave-nueva-larga' });
      expect((await client.delete('/auth/google/link')).status).toBe(204);
      expect((await client.get('/auth/me')).body).toMatchObject({
        hasPassword: true,
        googleLinked: false,
      });
      expect(await audits(id, 'GOOGLE_UNLINKED')).toBe(1);
    });

    it('darse de baja sin contraseña exige un login reciente', async () => {
      const stale = await googleOnlyAccount();
      await ageSession(stale.id);
      const denied = await stale.client.delete('/users/me').send({});
      expect(denied.status).toBe(403);

      const fresh = await googleOnlyAccount();
      expect((await fresh.client.delete('/users/me').send({})).status).toBe(204);
      expect((await dataSource.getRepository(User).findOneByOrFail({ id: fresh.id })).status).toBe(
        'DEACTIVATED',
      );
      // Una cuenta dada de baja no entra con Google.
      const again = await signInWithGoogle(new Client(app), fresh.account);
      expect(again).toMatchObject({ result: 'error', code: 'ACCOUNT_UNAVAILABLE' });
    });
  });
});
