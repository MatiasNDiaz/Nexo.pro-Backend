import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { purgeExpiredAuthData } from '../src/auth/auth-cleanup.job';
import type { FakePushProvider } from '../src/integrations/push/fake-push.provider';
import { PUSH_PROVIDER } from '../src/integrations/push/push-provider';
import { PushSubscription } from '../src/notifications/entities/push.entities';
import { MAX_PUSH_FAILURES, PushService } from '../src/notifications/push.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import {
  Client,
  FRONTEND,
  parseSetCookies,
  signInAdmin,
  signInCustomer,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional, openChat } from './utils/marketplace';
import { RealtimeTestClient } from './utils/realtime-client';

/** Claves con el formato de `PushSubscription.toJSON()` (el simulado no las usa para cifrar). */
const keys = () => ({ p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) });
const newEndpoint = () => `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

/** Etapa 13.3 (ADR 0032): notificaciones push web. */
describe('Notificaciones push (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let fake: FakePushProvider;
  let push: PushService;
  let admin: Client;
  let url: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    dataSource = app.get(DataSource);
    fake = app.get<FakePushProvider>(PUSH_PROVIDER);
    push = app.get(PushService);
    admin = (await signInAdmin(app)).client;
  });

  afterAll(async () => {
    await app.close();
  });

  async function subscribe(client: Client, endpoint = newEndpoint()) {
    const res = await client.post('/notifications/push/subscriptions', { endpoint, keys: keys() });
    expect(res.status).toBe(204);
    return endpoint;
  }

  /** Un mensaje del admin al usuario (categoría ACCOUNT) y espera los envíos. */
  async function adminMessage(userId: string, title = 'Aviso de prueba') {
    const res = await admin.post(`/admin/users/${userId}/message`, {
      title,
      body: 'Texto del aviso',
    });
    expect(res.status).toBe(204);
    await push.flush();
  }

  const rowOf = (endpoint: string) =>
    dataSource.getRepository(PushSubscription).findOneBy({ endpoint });

  it('da la clave pública y solo acepta servicios de push conocidos, con CSRF', async () => {
    const { client } = await signInCustomer(app);
    const key = await client.get('/notifications/push/key');
    expect(key.body).toEqual({ enabled: true, publicKey: expect.stringMatching(/^[\w-]{87}$/) });

    const internal = await client.post('/notifications/push/subscriptions', {
      endpoint: 'https://169.254.169.254/latest/meta-data',
      keys: keys(),
    });
    expect(internal.status).toBe(400);
    expect(internal.body.code).toBe('INVALID_PUSH_ENDPOINT');
    const badKeys = await client.post('/notifications/push/subscriptions', {
      endpoint: newEndpoint(),
      keys: { p256dh: 'corta', auth: 'x' },
    });
    expect(badKeys.status).toBe(400);

    const token = client.csrfToken;
    client.csrfToken = '';
    const noCsrf = await client.post('/notifications/push/subscriptions', {
      endpoint: newEndpoint(),
      keys: keys(),
    });
    expect(noCsrf.status).toBe(403);
    client.csrfToken = token;
  });

  it('un mensaje de chat llega con el mismo texto que en la plataforma, nunca el mensaje', async () => {
    const pro = await listedProfessional(app);
    const customer = await signInCustomer(app);
    const conversationId = await openChat(customer.client, pro.id);
    const endpoint = await subscribe(pro.client);

    await customer.client.post(`/chat/conversations/${conversationId}/messages`, {
      body: 'Mi dirección es Calle Falsa 123',
    });
    await push.flush();

    expect(fake.sentTo(endpoint)).toEqual([
      expect.objectContaining({
        type: 'NEW_MESSAGE',
        category: 'MESSAGES',
        title: 'Mensaje nuevo',
        body: 'Un cliente te escribió.',
        targetType: 'CONVERSATION',
        targetId: conversationId,
        tag: `NEW_MESSAGE:${conversationId}`,
      }),
    ]);
    const sent = fake.sent.filter((s) => s.endpoint === endpoint);
    expect(sent[0].message).toMatchObject({ urgency: 'high', ttlSec: 86_400 });
    expect(JSON.stringify(sent)).not.toContain('Calle Falsa');
    expect((await rowOf(endpoint))?.lastSuccessAt).not.toBeNull();
  });

  it('apagar una categoría corta el push pero no la notificación en la plataforma', async () => {
    const { client, id } = await signInCustomer(app);
    const endpoint = await subscribe(client);

    const initial = await client.get('/notifications/preferences');
    expect(initial.body).toHaveLength(6);
    expect((initial.body as Array<{ push: boolean }>).every((p) => p.push)).toBe(true);

    const off = await client.put('/notifications/preferences', {
      preferences: [{ category: 'ACCOUNT', push: false }],
    });
    expect(off.status).toBe(200);
    expect(off.body).toContainEqual({ category: 'ACCOUNT', push: false });
    await adminMessage(id);
    expect(fake.sentTo(endpoint)).toHaveLength(0);
    const inbox = await client.get('/notifications');
    expect((inbox.body as { data: Array<{ type: string }> }).data[0].type).toBe('ADMIN_MESSAGE');

    await client.put('/notifications/preferences', {
      preferences: [{ category: 'ACCOUNT', push: true }],
    });
    await adminMessage(id);
    expect(fake.sentTo(endpoint)).toHaveLength(1);

    // Las alertas del admin no son de un cliente.
    const foreign = await client.put('/notifications/preferences', {
      preferences: [{ category: 'ADMIN_ALERTS', push: false }],
    });
    expect(foreign.body.code).toBe('INVALID_CATEGORY');
  });

  it('con la app abierta no manda push; al cerrarla, sí', async () => {
    const { client, email, id } = await signInCustomer(app);
    const endpoint = await subscribe(client);
    const login = await new Client(app).login(email);
    const access = parseSetCookies(login.headers['set-cookie']).get('nx_at')?.value;
    const socket = new RealtimeTestClient(url, '/realtime', {
      origin: FRONTEND,
      cookie: `nx_at=${access}`,
    });
    expect(await socket.result).toBe('connected');

    await adminMessage(id);
    expect(fake.sentTo(endpoint)).toHaveLength(0);

    socket.close();
    const gateway = app.get(RealtimeGateway);
    for (let i = 0; i < 50 && (await gateway.isOnline(id)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await adminMessage(id);
    expect(fake.sentTo(endpoint)).toHaveLength(1);
  });

  it('al cerrar sesión ese navegador deja de recibir, y la limpieza diaria lo borra', async () => {
    const { client, id } = await signInCustomer(app);
    const endpoint = await subscribe(client);
    expect((await client.post('/auth/logout')).status).toBe(204);

    await adminMessage(id);
    expect(fake.sentTo(endpoint)).toHaveLength(0);
    expect((await purgeExpiredAuthData(dataSource)).pushSubscriptions).toBeGreaterThanOrEqual(1);
    expect(await rowOf(endpoint)).toBeNull();
  });

  it('se borra si el servicio dice que ya no existe, o después de 5 fallas seguidas', async () => {
    const { client, id } = await signInCustomer(app);
    const gone = await subscribe(client);
    const failing = await subscribe(client);
    fake.respondWith(gone, 'GONE');
    fake.respondWith(failing, 'FAILED');

    await adminMessage(id);
    expect(await rowOf(gone)).toBeNull();
    expect((await rowOf(failing))?.failureCount).toBe(1);
    for (let i = 1; i < MAX_PUSH_FAILURES - 1; i++) await adminMessage(id);
    expect((await rowOf(failing))?.failureCount).toBe(MAX_PUSH_FAILURES - 1);
    await adminMessage(id);
    expect(await rowOf(failing)).toBeNull();
  });

  it('el mismo navegador con otra cuenta pasa a la cuenta nueva; hasta 10 por cuenta', async () => {
    const first = await signInCustomer(app);
    const second = await signInCustomer(app);
    const shared = await subscribe(first.client);
    await subscribe(second.client, shared);
    expect((await rowOf(shared))?.userId).toBe(second.id);

    await adminMessage(first.id);
    expect(fake.sentTo(shared)).toHaveLength(0);

    // 12 navegadores: 9 más desde este (10 por minuto por IP) y 2 desde otro dispositivo.
    for (let i = 0; i < 9; i++) await subscribe(first.client);
    const otherDevice = new Client(app);
    await otherDevice.login(first.email);
    for (let i = 0; i < 2; i++) await subscribe(otherDevice);
    expect(await dataSource.getRepository(PushSubscription).countBy({ userId: first.id })).toBe(10);

    // La baja solo borra las propias.
    await first.client.post('/notifications/push/subscriptions/remove', { endpoint: shared });
    expect(await rowOf(shared)).not.toBeNull();
    await second.client.post('/notifications/push/subscriptions/remove', { endpoint: shared });
    expect(await rowOf(shared)).toBeNull();
  });
});
