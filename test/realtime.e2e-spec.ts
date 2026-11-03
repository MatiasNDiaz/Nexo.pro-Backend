import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client, FRONTEND, parseSetCookies, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional, openChat } from './utils/marketplace';
import { RealtimeTestClient } from './utils/realtime-client';

/** ADR 0024: avisos en tiempo real con la cookie de sesión y el mismo control de origen. */
describe('Tiempo real (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  const clients: RealtimeTestClient[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    for (const client of clients) client.close();
    await app.close();
  });

  /** Cookie de acceso de un login nuevo de ese email. */
  async function accessCookie(email: string): Promise<string> {
    const res = await new Client(app).login(email);
    const header = res.headers['set-cookie'] as unknown as string[] | undefined;
    const value = parseSetCookies(header).get('nx_at')?.value;
    if (!value) throw new Error('Sin cookie de acceso');
    return `nx_at=${value}`;
  }

  function connect(headers: Record<string, string>): RealtimeTestClient {
    const client = new RealtimeTestClient(url, '/realtime', headers);
    clients.push(client);
    return client;
  }

  it('rechaza conexiones sin sesión, con una sesión inválida o desde otro origen', async () => {
    const { email } = await signInCustomer(app);
    const cookie = await accessCookie(email);
    expect(await connect({ origin: FRONTEND }).result).toBe('rejected');
    expect(await connect({ origin: FRONTEND, cookie: 'nx_at=basura' }).result).toBe('rejected');
    expect(await connect({ origin: 'https://evil.example', cookie }).result).toBe('rejected');
    expect(await connect({ cookie }).result).toBe('rejected');
    expect(await connect({ origin: FRONTEND, cookie }).result).toBe('connected');
  });

  it('avisa los mensajes nuevos, las notificaciones y la lectura a quien corresponde', async () => {
    const pro = await listedProfessional(app);
    const customer = await signInCustomer(app);
    const conversationId = await openChat(customer.client, pro.id);
    const proSocket = connect({ origin: FRONTEND, cookie: await accessCookie(pro.email) });
    const customerSocket = connect({
      origin: FRONTEND,
      cookie: await accessCookie(customer.email),
    });
    expect(await proSocket.result).toBe('connected');
    expect(await customerSocket.result).toBe('connected');

    await customer.client.post(`/chat/conversations/${conversationId}/messages`, {
      body: 'Hola en vivo',
    });
    expect(await proSocket.next('message:new')).toMatchObject({
      body: 'Hola en vivo',
      conversationId,
    });
    expect(await proSocket.next('notification:new')).toMatchObject({
      type: 'NEW_MESSAGE',
      targetId: conversationId,
    });
    // Quien escribió también lo recibe (sus otros dispositivos).
    expect(await customerSocket.next('message:new')).toMatchObject({ conversationId });

    await pro.client.post(`/chat/conversations/${conversationId}/read`);
    expect(await customerSocket.next('conversation:read')).toMatchObject({ conversationId });
  }, 20_000);
});
