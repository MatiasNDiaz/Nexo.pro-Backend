import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AccountStatus } from '../src/users/user.enums';
import {
  Client,
  cordobaLocalityId,
  professionId,
  signInCustomer,
  signInProfessional,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

interface Card {
  userId: string;
  firstName: string;
  lastName: string;
  postCount: number;
  openRequestCount: number;
  lastPostAt: string | null;
  professions: Array<{ id: string; name: string }>;
  localities: Array<{ id: string; name: string }>;
}

/** Catálogo de clientes para profesionales (ADR 0037). */
describe('Clientes (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Nombre único para encontrarlo con la búsqueda (todos los clientes de prueba se llaman igual). */
  const rename = (id: string, firstName: string, lastName: string) =>
    dataSource.query('UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3', [
      firstName,
      lastName,
      id,
    ]);

  it('todos los clientes activos, primero los que publicaron, sin datos de contacto', async () => {
    const tag = `Cli${randomUUID().slice(0, 6)}`;
    const withPost = await signInCustomer(app);
    const quiet = await signInCustomer(app);
    const suspended = await signInCustomer(app);
    await rename(withPost.id, tag, 'Publica');
    await rename(quiet.id, tag, 'Callado');
    await rename(suspended.id, tag, 'Suspendido');
    const locality = await cordobaLocalityId(withPost.client);
    const profession = await professionId(withPost.client);
    const post = await withPost.client.post('/forum/posts', {
      type: 'PROFESSIONAL_WANTED',
      body: 'Necesito cambiar el cableado de la cocina',
      professionIds: [profession],
      localityId: locality,
    });
    expect(post.status).toBe(201);
    await dataSource.query('UPDATE users SET status = $1 WHERE id = $2', [
      AccountStatus.SUSPENDED,
      suspended.id,
    ]);

    // Cualquier profesional con sesión, aunque su cuenta esté por activar.
    const pro = await signInProfessional(app, AccountStatus.PENDING_VERIFICATION);
    const list = async (query: string) => {
      const res = await pro.client.get(`/customers?q=${tag}${query}`);
      expect(res.status).toBe(200);
      return res.body as { data: Card[]; total: number };
    };

    const all = await list('');
    expect(all.total).toBe(2);
    expect(all.data.map((c) => c.lastName)).toEqual(['Publica', 'Callado']);
    expect(all.data[0]).toMatchObject({
      userId: withPost.id,
      postCount: 1,
      openRequestCount: 1,
      professions: [{ id: profession, name: expect.any(String) }],
      localities: [{ id: locality, name: expect.any(String) }],
    });
    expect(all.data[0].lastPostAt).toEqual(expect.any(String));
    expect(all.data[1]).toMatchObject({ postCount: 0, openRequestCount: 0, lastPostAt: null });
    for (const card of all.data) {
      expect(Object.keys(card)).not.toEqual(
        expect.arrayContaining(['email', 'phone', 'neighborhood']),
      );
    }

    expect((await list('&withOpenRequests=true')).data.map((c) => c.userId)).toEqual([withPost.id]);
    expect((await list(`&professionId=${profession}`)).data).toHaveLength(1);
    expect((await list(`&localityId=${locality}`)).data).toHaveLength(1);

    // Ficha: la tarjeta y sus publicaciones (las del foro, filtradas por autor).
    const card = await pro.client.get(`/customers/${withPost.id}`);
    expect(card.status).toBe(200);
    expect((card.body as Card).postCount).toBe(1);
    const posts = await pro.client.get(`/forum/posts?authorId=${withPost.id}`);
    expect((posts.body as { data: Array<{ id: string }> }).data.map((p) => p.id)).toEqual([
      (post.body as { id: string }).id,
    ]);

    // Ni suspendidos ni otros roles.
    expect((await pro.client.get(`/customers/${suspended.id}`)).status).toBe(404);
    expect((await pro.client.get(`/customers/${pro.id}`)).status).toBe(404);
  });

  it('al resolver la solicitud, deja de contar como abierta', async () => {
    const tag = `Res${randomUUID().slice(0, 6)}`;
    const customer = await signInCustomer(app);
    await rename(customer.id, tag, 'Resuelve');
    const post = await customer.client.post('/forum/posts', {
      type: 'PROFESSIONAL_WANTED',
      body: 'Busco pintor para el living',
    });
    await customer.client.post(`/forum/posts/${(post.body as { id: string }).id}/resolve`);
    const pro = await signInProfessional(app);
    const res = await pro.client.get(`/customers?q=${tag}&withOpenRequests=true`);
    expect((res.body as { total: number }).total).toBe(0);
  });

  it('solo para profesionales, y valida los filtros', async () => {
    const customer = await signInCustomer(app);
    expect((await customer.client.get('/customers')).status).toBe(403);
    expect((await new Client(app).get('/customers')).status).toBe(401);
    const pro = await signInProfessional(app);
    expect((await pro.client.get('/customers?q=a')).status).toBe(400);
    expect((await pro.client.get('/customers?limit=100')).status).toBe(400);
    expect((await pro.client.get('/customers/no-es-un-id')).status).toBe(400);
    // `%` se busca literal, no como comodín.
    const literal = await pro.client.get(`/customers?q=${encodeURIComponent('%%')}`);
    expect((literal.body as { total: number }).total).toBe(0);
  });
});
