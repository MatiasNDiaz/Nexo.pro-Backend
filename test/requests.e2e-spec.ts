import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Quote, ServiceContractHistory } from '../src/requests/entities/requests.entities';
import { Subscription } from '../src/subscriptions/entities/subscription.entity';
import { type Client, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional, openChat } from './utils/marketplace';

interface RequestBody {
  id: string;
  status: string;
  contractId: string | null;
  targets: Array<{
    id: string;
    professionalId: string;
    conversationId: string;
    status: string;
    currentQuote: { id: string; amount: string; status: string } | null;
  }>;
}

/** ADR 0025: solicitudes, presupuestos y contrataciones. */
describe('Solicitudes y contrataciones (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Un cliente le manda un pedido a N profesionales visibles que ofrecen el mismo oficio. */
  async function scenario(count = 2) {
    const pros = [];
    for (let i = 0; i < count; i++) pros.push(await listedProfessional(app));
    const customer = await signInCustomer(app);
    const res = await customer.client.post('/requests', {
      professionalIds: pros.map((p) => p.id),
      professionId: pros[0].professionId,
      description: 'Pierde agua la canilla de la cocina',
      urgency: 'IMPATIENT',
    });
    expect(res.status).toBe(201);
    const request = res.body as RequestBody;
    const targetOf = (proId: string) => request.targets.find((t) => t.professionalId === proId)!;
    return { pros, customer, request, targetOf };
  }

  const messagesOf = async (client: Client, conversationId: string) =>
    (await client.get(`/chat/conversations/${conversationId}/messages`)).body as Array<{
      body: string;
      senderType: string;
    }>;

  it('el pedido llega a cada profesional en su chat, con su notificación', async () => {
    const { pros, request, targetOf } = await scenario();
    expect(request.targets.map((t) => t.status)).toEqual(['PENDING', 'PENDING']);
    for (const pro of pros) {
      const target = targetOf(pro.id);
      const messages = await messagesOf(pro.client, target.conversationId);
      expect(messages[0]).toMatchObject({
        senderType: 'SYSTEM',
        body: expect.stringContaining('Pierde agua la canilla'),
      });
      const received = (await pro.client.get('/requests/received')).body as RequestBody[];
      // Cada profesional ve solo su negociación.
      expect(received.find((r) => r.id === request.id)?.targets).toHaveLength(1);
      const notifications = (await pro.client.get('/notifications')).body.data as Array<{
        type: string;
        targetId: string;
      }>;
      expect(notifications).toContainEqual(
        expect.objectContaining({ type: 'NEW_REQUEST', targetId: request.id }),
      );
    }
  });

  it('negociación, presupuesto corregido y elección: los demás quedan NOT_SELECTED', async () => {
    const { pros, customer, request, targetOf } = await scenario();
    const [answering, quoting] = pros;

    // Elegir a quien no respondió: no se puede.
    const early = await customer.client.post(
      `/requests/targets/${targetOf(answering.id).id}/select`,
      {},
    );
    expect(early.status).toBe(409);

    await answering.client.post(
      `/chat/conversations/${targetOf(answering.id).conversationId}/messages`,
      { body: 'Hola, ¿de qué marca es la canilla?' },
    );
    const first = await quoting.client.post(`/requests/targets/${targetOf(quoting.id).id}/quotes`, {
      amount: 15000,
    });
    expect(first.status).toBe(201);
    const second = await quoting.client.post(
      `/requests/targets/${targetOf(quoting.id).id}/quotes`,
      {
        amount: 12500.5,
        description: 'Incluye cuerito',
        proposedDate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    );
    const quoteId = (second.body as RequestBody).targets[0].currentQuote!.id;
    expect(
      await dataSource.getRepository(Quote).countBy({ targetId: targetOf(quoting.id).id }),
    ).toBe(2);

    const now = (await customer.client.get(`/requests/${request.id}`)).body as RequestBody;
    expect(now.targets.find((t) => t.professionalId === answering.id)?.status).toBe(
      'IN_DISCUSSION',
    );
    expect(now.targets.find((t) => t.professionalId === quoting.id)).toMatchObject({
      status: 'QUOTED',
      currentQuote: { amount: '12500.50', status: 'SENT' },
    });

    const selected = await customer.client.post(
      `/requests/targets/${targetOf(quoting.id).id}/select`,
      { quoteId },
    );
    expect(selected.status).toBe(201);
    expect(selected.body).toMatchObject({
      status: 'ACCEPTED',
      professionalId: quoting.id,
      acceptedQuote: { id: quoteId, status: 'ACCEPTED' },
    });

    const after = (await customer.client.get(`/requests/${request.id}`)).body as RequestBody;
    expect(after.status).toBe('SELECTED');
    expect(after.targets.find((t) => t.professionalId === answering.id)?.status).toBe(
      'NOT_SELECTED',
    );
    const loserChat = await messagesOf(answering.client, targetOf(answering.id).conversationId);
    expect(loserChat.at(-1)?.body).toBe('El cliente Ana ya seleccionó a un profesional.');
    // El otro profesional ya no ve el contrato ajeno.
    const loserView = (await answering.client.get(`/requests/${request.id}`)).body as RequestBody;
    expect(loserView.contractId).toBeNull();

    const twice = await customer.client.post(
      `/requests/targets/${targetOf(answering.id).id}/select`,
      {},
    );
    expect(twice.status).toBe(409);
  });

  it('la contratación avanza solo por el profesional y guarda las transiciones', async () => {
    const { pros, customer, targetOf } = await scenario(1);
    const [pro] = pros;
    await pro.client.post(`/requests/targets/${targetOf(pro.id).id}/quotes`, { amount: 9000 });
    const contract = (
      await customer.client.post(`/requests/targets/${targetOf(pro.id).id}/select`, {})
    ).body as { id: string; acceptedQuote: unknown };
    expect(contract.acceptedQuote).toBeNull();
    const path = (action: string) => `/contracts/${contract.id}/${action}`;

    expect((await customer.client.post(path('start'))).status).toBe(403);
    const past = await pro.client.post(path('schedule'), {
      scheduledAt: '2020-01-01T10:00:00.000Z',
    });
    expect(past.status).toBe(400);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect((await pro.client.post(path('schedule'), { scheduledAt: tomorrow })).body.status).toBe(
      'SCHEDULED',
    );
    const started = await pro.client.post(path('start'));
    expect(started.body).toMatchObject({
      status: 'IN_PROGRESS',
      suggestedAttentionStatus: 'WORKING',
    });
    // C-30: el estado de atención no cambió solo.
    expect((await pro.client.get('/professionals/me')).body.attention.manual).toBe('RESTING');
    expect((await pro.client.post(path('complete'))).body.status).toBe('COMPLETED');

    const late = await customer.client.post(path('cancel'), { reason: 'Ya no lo necesito' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('INVALID_STATE_TRANSITION');
    const history = await dataSource
      .getRepository(ServiceContractHistory)
      .find({ where: { contractId: contract.id }, order: { createdAt: 'ASC' } });
    expect(history.map((h) => h.toStatus)).toEqual([
      'ACCEPTED',
      'SCHEDULED',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
    const chat = await messagesOf(
      customer.client,
      (await customer.client.get(`/contracts/${contract.id}`)).body.conversationId as string,
    );
    expect(chat.at(-1)?.body).toBe('El profesional marcó el trabajo como terminado.');
  });

  it('el cliente cancela la contratación con motivo opcional', async () => {
    const { pros, customer, targetOf } = await scenario(1);
    const [pro] = pros;
    await pro.client.post(`/requests/targets/${targetOf(pro.id).id}/quotes`, { amount: 5000 });
    const contract = (
      await customer.client.post(`/requests/targets/${targetOf(pro.id).id}/select`, {})
    ).body as { id: string };
    const res = await customer.client.post(`/contracts/${contract.id}/cancel`, {
      reason: 'Se resolvió solo',
    });
    expect(res.body).toMatchObject({
      status: 'CANCELLED_BY_CLIENT',
      cancelReason: 'Se resolvió solo',
    });
  });

  it('cancelar el pedido sin respuestas deja el mensaje de disculpas; rechazar es del profesional', async () => {
    const { pros, customer, request, targetOf } = await scenario();
    const [declining, waiting] = pros;
    const declined = await declining.client.post(
      `/requests/targets/${targetOf(declining.id).id}/decline`,
      { reason: 'No llego esta semana' },
    );
    expect((declined.body as RequestBody).targets[0].status).toBe('DECLINED');
    expect(
      (await customer.client.post(`/requests/targets/${targetOf(declining.id).id}/decline`, {}))
        .status,
    ).toBe(403);

    const cancelled = await customer.client.post(`/requests/${request.id}/cancel`, {});
    expect((cancelled.body as RequestBody).status).toBe('CANCELLED');
    const chat = await messagesOf(waiting.client, targetOf(waiting.id).conversationId);
    expect(chat.at(-1)?.body).toBe('Ya lo solucioné, disculpas por la molestia.');
    expect((await customer.client.post(`/requests/${request.id}/cancel`, {})).status).toBe(409);
  });

  it('solo a profesionales que ofrecen ese oficio, y nadie ve pedidos ajenos', async () => {
    const pro = await listedProfessional(app);
    const customer = await signInCustomer(app);
    const professions = (await customer.client.get('/professions')).body as Array<{ id: string }>;
    const other = professions.find((p) => p.id !== pro.professionId)!;
    const res = await customer.client.post('/requests', {
      professionalIds: [pro.id],
      professionId: other.id,
      description: 'Necesito otra cosa',
      urgency: 'CAN_WAIT',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROFESSION_NOT_OFFERED');

    const { request } = await scenario(1);
    expect((await customer.client.get(`/requests/${request.id}`)).status).toBe(404);
    expect((await pro.client.get(`/requests/${request.id}`)).status).toBe(404);
  });

  it('C-12: sin plan vigente, el chat sigue solo mientras haya una contratación en curso', async () => {
    const { pros, customer, targetOf } = await scenario(1);
    const [pro] = pros;
    const conversationId = targetOf(pro.id).conversationId;
    await pro.client.post(`/requests/targets/${targetOf(pro.id).id}/quotes`, { amount: 9000 });
    const contract = (
      await customer.client.post(`/requests/targets/${targetOf(pro.id).id}/select`, {})
    ).body as { id: string };
    // Otro cliente le escribió antes, sin contratación.
    const other = await signInCustomer(app);
    const otherChat = await openChat(other.client, pro.id);
    await dataSource
      .getRepository(Subscription)
      .update({ userId: pro.id }, { trialEndsAt: new Date(Date.now() - 1000) });
    const write = (client: Client, id: string, body: string) =>
      client.post(`/chat/conversations/${id}/messages`, { body });

    expect((await write(customer.client, conversationId, 'Mañana a las 10?')).status).toBe(201);
    expect((await write(pro.client, conversationId, 'Dale, ahí estoy')).status).toBe(201);
    const list = (await pro.client.get('/chat/conversations')).body as Array<{ id: string }>;
    expect(list.map((c) => c.id)).toEqual([conversationId]);
    expect((await write(other.client, otherChat, 'hola?')).body.code).toBe(
      'PROFESSIONAL_UNAVAILABLE',
    );
    expect((await pro.client.get(`/chat/conversations/${otherChat}/messages`)).status).toBe(403);
    expect(
      ((await pro.client.get('/contracts')).body as Array<{ id: string }>).map((c) => c.id),
    ).toEqual([contract.id]);

    // La lleva hasta el cierre; después, el cliente lee pero no escribe.
    expect((await pro.client.post(`/contracts/${contract.id}/complete`)).status).toBe(200);
    expect((await write(customer.client, conversationId, 'Gracias!')).body.code).toBe(
      'PROFESSIONAL_UNAVAILABLE',
    );
    expect(
      (await customer.client.get(`/chat/conversations/${conversationId}/messages`)).status,
    ).toBe(200);
    expect((await pro.client.get('/chat/conversations')).body.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});
