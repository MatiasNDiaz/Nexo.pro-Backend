import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { Neighborhood } from '../src/locations/entities/neighborhood.entity';
import { ProfessionalProfile } from '../src/professionals/entities/professional-profile.entity';
import { ProfessionalServiceArea } from '../src/professionals/entities/professional-service-area.entity';
import { User } from '../src/users/entities/user.entity';
import {
  Client,
  cordobaLocalityId,
  PASSWORD,
  professionId,
  registerCustomer,
  signInAdmin,
  uniqueEmail,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

describe('Moderación de barrios (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Client;
  let localityId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = (await signInAdmin(app)).client;
    localityId = await cordobaLocalityId(new Client(app));
  });

  afterAll(async () => {
    await app.close();
  });

  /** Nombre de barrio único por test (los barrios se comparten en toda la base de tests). */
  const uniqueName = (prefix: string) =>
    `${prefix} ${randomUUID().slice(0, 6).replace(/\d/g, 'x')}`;

  const neighborhoodOf = async (email: string) => {
    const user = await dataSource.getRepository(User).findOneByOrFail({ email });
    return dataSource
      .getRepository(Neighborhood)
      .findOneByOrFail({ id: user.neighborhoodId ?? '' });
  };

  async function registerProfessional(zones: string[]) {
    const email = uniqueEmail('pro');
    const client = new Client(app);
    const res = await client.post('/auth/register', {
      role: 'PROFESSIONAL',
      email,
      password: PASSWORD,
      firstName: 'Juan',
      lastName: 'Gómez',
      phone: '3511234567',
      professionId: await professionId(client),
      serviceAreas: zones.map((neighborhoodName) => ({ localityId, neighborhoodName })),
    });
    expect(res.status).toBe(202);
    const user = await dataSource.getRepository(User).findOneByOrFail({ email });
    return dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ userId: user.id });
  }

  const zonesOf = async (professionalId: string) =>
    (await dataSource.getRepository(ProfessionalServiceArea).findBy({ professionalId }))
      .map((zone) => zone.neighborhoodId)
      .sort();

  it('lista los pendientes con su uso y al aprobar aparecen en el autocompletado', async () => {
    const name = uniqueName('moderado');
    const email = await registerCustomer(app, { neighborhood: name });
    const pending = await neighborhoodOf(email);

    const list = await admin.get(`/admin/neighborhoods?localityId=${localityId}&search=${name}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: pending.id,
        status: 'PENDING',
        usage: { residents: 1, serviceAreas: 0 },
      }),
    ]);
    const search = () =>
      new Client(app).get(`/locations/neighborhoods?localityId=${localityId}&search=${name}`);
    expect((await search()).body).toEqual([]);

    const approved = await admin.post(`/admin/neighborhoods/${pending.id}/approve`, {
      reason: 'Barrio real',
    });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', reviewedById: expect.any(String) });
    expect((await search()).body).toEqual([{ id: pending.id, name: pending.name }]);

    const twice = await admin.post(`/admin/neighborhoods/${pending.id}/approve`);
    expect(twice.status).toBe(409);
    expect(
      await dataSource
        .getRepository(AdminAuditLog)
        .countBy({ targetId: pending.id, action: 'NEIGHBORHOOD_APPROVED' }),
    ).toBe(1);
  });

  it('renombra respetando las mayúsculas y no deja duplicar un nombre existente', async () => {
    const taken = await neighborhoodOf(
      await registerCustomer(app, { neighborhood: uniqueName('ocupado') }),
    );
    const target = await neighborhoodOf(
      await registerCustomer(app, { neighborhood: uniqueName('mal escrito') }),
    );

    const renamed = await admin.patch(`/admin/neighborhoods/${target.id}`, {
      name: `  Barrio  ${target.normalizedName.toUpperCase()} Corregido `,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe(`Barrio ${target.normalizedName.toUpperCase()} Corregido`);
    expect(renamed.body.normalizedName).toBe(`barrio ${target.normalizedName} corregido`);

    const clash = await admin.patch(`/admin/neighborhoods/${target.id}`, { name: taken.name });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('NEIGHBORHOOD_NAME_TAKEN');
    expect((await admin.patch(`/admin/neighborhoods/${target.id}`, { name: '!!' })).status).toBe(
      400,
    );
  });

  it('fusiona: mueve clientes y zonas sin duplicar, y el nombre viejo queda como alias', async () => {
    const goodName = uniqueName('destino');
    const typoName = uniqueName('con error');
    const resident = await registerCustomer(app, { neighborhood: typoName });
    const source = await neighborhoodOf(resident);
    const targetOwner = await registerCustomer(app, { neighborhood: goodName });
    const target = await neighborhoodOf(targetOwner);

    // Trabaja en los dos (se deduplica) y otro solo en el de error (se mueve).
    const both = await registerProfessional([typoName, goodName]);
    const onlySource = await registerProfessional([typoName]);

    const notApproved = await admin.post(`/admin/neighborhoods/${source.id}/merge`, {
      targetId: target.id,
    });
    expect(notApproved.status).toBe(409);
    expect(notApproved.body.code).toBe('TARGET_NOT_APPROVED');

    await admin.post(`/admin/neighborhoods/${target.id}/approve`);
    const merged = await admin.post(`/admin/neighborhoods/${source.id}/merge`, {
      targetId: target.id,
      reason: 'Mismo barrio mal escrito',
    });
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({
      status: 'MERGED',
      mergedIntoId: target.id,
      usage: { residents: 0, serviceAreas: 0 },
    });

    expect((await neighborhoodOf(resident)).id).toBe(target.id);
    expect(await zonesOf(both.id)).toEqual([target.id]);
    expect(await zonesOf(onlySource.id)).toEqual([target.id]);

    // Quien vuelva a escribir el nombre con error cae en el barrio correcto.
    const later = await registerCustomer(app, { neighborhood: typoName.toUpperCase() });
    expect((await neighborhoodOf(later)).id).toBe(target.id);

    const audit = await dataSource
      .getRepository(AdminAuditLog)
      .findOneByOrFail({ targetId: source.id, action: 'NEIGHBORHOOD_MERGED' });
    expect(audit.metadata).toMatchObject({ into: target.id, residents: 1, serviceAreas: 1 });

    const again = await admin.post(`/admin/neighborhoods/${source.id}/merge`, {
      targetId: target.id,
    });
    expect(again.status).toBe(409);
    expect(
      (await admin.post(`/admin/neighborhoods/${target.id}/merge`, { targetId: target.id })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/admin/neighborhoods/${randomUUID()}/merge`, { targetId: target.id }))
        .status,
    ).toBe(404);
  });
});
