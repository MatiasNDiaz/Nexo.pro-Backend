import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { AuthSession } from '../src/auth/entities/auth-session.entity';
import { SessionCloseLinkService } from '../src/auth/services/session-close-link.service';
import { EDGE_SECRET_HEADER } from '../src/integrations/geo/geo-locator';
import {
  Client,
  FRONTEND,
  lastMailToken,
  mailbox,
  parseSetCookies,
  signInCustomer,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

const SUBJECT = 'Nuevo inicio de sesión en tu cuenta';
/** El de `.env.test` (público, solo tests). */
const EDGE_SECRET = 'test-only-cloudflare-edge-secret-00000000';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DAY = 24 * 60 * 60 * 1000;

/** Etapa 13.2 (ADR 0031): aviso por email de un inicio de sesión desde un dispositivo nuevo. */
describe('Aviso de dispositivo nuevo (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const alerts = (email: string) =>
    mailbox(app).sent.filter((m) => m.to === email && m.subject === SUBJECT);

  /** Otro dispositivo: sin cookies, con su navegador y lo que agregaría Cloudflare. */
  function otherDevice(headers: Record<string, string> = {}) {
    const client = new Client(app);
    client.agent.set('User-Agent', CHROME_WINDOWS);
    for (const [name, value] of Object.entries(headers)) client.agent.set(name, value);
    return client;
  }

  it('el primer inicio de sesión de la cuenta no avisa, y el mismo dispositivo tampoco', async () => {
    const { client, email } = await signInCustomer(app);
    expect(alerts(email)).toHaveLength(0);

    const again = await client.login(email);
    expect(again.status).toBe(200);
    expect(alerts(email)).toHaveLength(0);

    const cookie = parseSetCookies(again.headers['set-cookie']).get('nx_device');
    expect(cookie?.attributes).toMatchObject({
      httponly: true,
      samesite: 'Lax',
      path: '/api/v1/auth',
      'max-age': String(400 * 24 * 60 * 60),
    });
  });

  it('desde otro dispositivo avisa con fecha, navegador, ciudad y el enlace para cerrarla', async () => {
    const { client: mine, email, id } = await signInCustomer(app);
    const intruder = otherDevice({
      [EDGE_SECRET_HEADER]: EDGE_SECRET,
      // El cliente HTTP los manda en UTF-8, como Cloudflare; la API los recibe como latin1.
      'cf-ipcity': 'Río Cuarto',
      'cf-region': 'Córdoba',
      'cf-ipcountry': 'AR',
    });
    expect((await intruder.login(email)).status).toBe(200);

    const [mail] = alerts(email);
    expect(mail.text).toMatch(/Fecha y hora: .+ \(hora de Córdoba\)/);
    expect(mail.text).toContain('Dispositivo: Chrome en Windows');
    expect(mail.text).toContain('Ubicación aproximada: Río Cuarto, Córdoba');
    expect(mail.text).toContain(`${FRONTEND}/cerrar-sesion?token=`);
    // La ciudad no se guarda en ningún lado.
    const rows = await dataSource.getRepository(AuthSession).findBy({ userId: id });
    expect(JSON.stringify(rows)).not.toContain('Río Cuarto');

    // "No fui yo": se cierra desde cualquier navegador, sin sesión.
    const token = lastMailToken(app, email);
    const closed = await new Client(app).post('/auth/sessions/close-by-link', { token });
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ closed: true });
    expect((await intruder.get('/auth/me')).status).toBe(401);
    expect((await mine.get('/auth/me')).status).toBe(200);

    // Repetido: no pasa nada.
    const twice = await new Client(app).post('/auth/sessions/close-by-link', { token });
    expect(twice.body).toEqual({ closed: false });
    const logs = await dataSource.getRepository(AdminAuditLog).findBy({
      action: 'SESSION_CLOSED_FROM_EMAIL',
      targetId: id,
    });
    expect(logs.map((l) => l.metadata?.closed).sort()).toEqual([false, true]);
    expect(logs.every((l) => /^[0-9a-f]{64}$/.test(l.ipHash ?? ''))).toBe(true);
  });

  it('sin el secreto de Cloudflare no confía en la ciudad: "no disponible"', async () => {
    const { email } = await signInCustomer(app);
    await otherDevice({ 'cf-ipcity': 'Córdoba' }).login(email);
    expect(alerts(email)[0].text).toContain('Ubicación aproximada: no disponible');
  });

  it('un enlace adulterado o vencido no cierra nada', async () => {
    const { email, id } = await signInCustomer(app);
    const intruder = otherDevice();
    await intruder.login(email);
    const token = lastMailToken(app, email);
    const forged = token.slice(0, 60) + (token[60] === 'A' ? 'B' : 'A') + token.slice(61);
    const bad = await new Client(app).post('/auth/sessions/close-by-link', { token: forged });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_TOKEN');

    const [{ family_id: familyId }] = await dataSource.query<Array<{ family_id: string }>>(
      `SELECT family_id FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    const expired = app
      .get(SessionCloseLinkService)
      .issue({ userId: id, familyId }, new Date(Date.now() - 8 * DAY));
    const late = await new Client(app).post('/auth/sessions/close-by-link', { token: expired });
    expect(late.body.code).toBe('INVALID_TOKEN');
    expect((await intruder.get('/auth/me')).status).toBe(200);
  });

  it('al renovar la sesión el dispositivo se conserva y no vuelve a avisar', async () => {
    const { client, email, id } = await signInCustomer(app);
    expect((await client.post('/auth/refresh')).status).toBe(200);
    const hashes = await dataSource.query<Array<{ device_hash: string | null }>>(
      `SELECT device_hash FROM auth_sessions WHERE user_id = $1`,
      [id],
    );
    expect(hashes).toHaveLength(2);
    expect(new Set(hashes.map((h) => h.device_hash)).size).toBe(1);
    expect(hashes[0].device_hash).toMatch(/^[0-9a-f]{64}$/);

    await client.login(email);
    expect(alerts(email)).toHaveLength(0);
  });
});
