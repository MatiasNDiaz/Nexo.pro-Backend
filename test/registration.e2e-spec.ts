import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { Neighborhood, NeighborhoodStatus } from '../src/locations/entities/neighborhood.entity';
import { ProfessionalProfession } from '../src/professionals/entities/professional-profession.entity';
import { ProfessionalProfile } from '../src/professionals/entities/professional-profile.entity';
import { ProfessionalServiceArea } from '../src/professionals/entities/professional-service-area.entity';
import { User } from '../src/users/entities/user.entity';
import {
  Client,
  cordobaLocalityId,
  customerPayload,
  mailbox,
  PASSWORD,
  professionId,
  uniqueEmail,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

/** Registro en dos pasos (ADR 0006) y barrios creados por los usuarios (ADR 0010). */
describe('Registro y barrios (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let localityId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    localityId = await cordobaLocalityId(new Client(app));
  });

  afterAll(async () => {
    await app.close();
  });

  const userByEmail = (email: string) => dataSource.getRepository(User).findOneByOrFail({ email });

  function professionalPayload(email: string, profession: string, serviceAreas: object[]) {
    return {
      role: 'PROFESSIONAL',
      email,
      password: PASSWORD,
      firstName: 'Juan',
      lastName: 'Gómez',
      phone: '3511234567',
      professionId: profession,
      serviceAreas,
    };
  }

  describe('cliente', () => {
    it('queda PENDING_VERIFICATION, con un barrio nuevo PENDING y el email de verificación', async () => {
      const email = uniqueEmail();
      const res = await new Client(app).post(
        '/auth/register',
        customerPayload(email, localityId, '  villa   belgrano '),
      );
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ message: expect.stringContaining('te enviamos un email') });

      const user = await userByEmail(email);
      expect(user).toMatchObject({
        role: 'CUSTOMER',
        status: 'PENDING_VERIFICATION',
        phone: '+5493511234567',
      });
      const neighborhood = await dataSource
        .getRepository(Neighborhood)
        .findOneByOrFail({ id: user.neighborhoodId ?? '' });
      expect(neighborhood).toMatchObject({
        name: 'Villa Belgrano',
        normalizedName: 'villa belgrano',
        status: NeighborhoodStatus.PENDING,
        createdByUserId: user.id,
      });
      expect(mailbox(app).lastTo(email)?.text).toContain(
        'http://localhost:3000/verificar-email?token=',
      );
    });

    it('no duplica barrios: mayúsculas, tildes y espacios caen en el mismo', async () => {
      const first = uniqueEmail();
      const second = uniqueEmail();
      await new Client(app).post(
        '/auth/register',
        customerPayload(first, localityId, 'Barrio Güemes'),
      );
      await new Client(app).post(
        '/auth/register',
        customerPayload(second, localityId, 'barrio   GUEMES'),
      );
      const [a, b] = await Promise.all([userByEmail(first), userByEmail(second)]);
      expect(a.neighborhoodId).toBe(b.neighborhoodId);
    });

    it('un barrio fusionado funciona como alias de su destino', async () => {
      const repo = dataSource.getRepository(Neighborhood);
      const target = repo.create({
        localityId,
        name: 'General Paz',
        normalizedName: 'general paz',
        status: NeighborhoodStatus.APPROVED,
      });
      await repo.insert(target);
      const alias = repo.create({
        localityId,
        name: 'Gral Paz',
        normalizedName: 'gral paz',
        status: NeighborhoodStatus.MERGED,
        mergedIntoId: target.id,
      });
      await repo.insert(alias);

      const email = uniqueEmail();
      await new Client(app).post('/auth/register', customerPayload(email, localityId, 'Gral. Paz'));
      expect((await userByEmail(email)).neighborhoodId).toBe(target.id);
    });

    it('el autocompletado público solo muestra barrios aprobados', async () => {
      const email = uniqueEmail();
      await new Client(app).post(
        '/auth/register',
        customerPayload(email, localityId, 'Barrio Pendiente Único'),
      );
      const client = new Client(app);
      const pending = await client.get(
        `/locations/neighborhoods?localityId=${localityId}&search=pendiente`,
      );
      expect(pending.body).toEqual([]);

      await dataSource
        .getRepository(Neighborhood)
        .update(
          { normalizedName: 'barrio pendiente unico' },
          { status: NeighborhoodStatus.APPROVED },
        );
      const approved = await client.get(
        `/locations/neighborhoods?localityId=${localityId}&search=pendiénte`,
      );
      expect(approved.body).toEqual([{ id: expect.any(String), name: 'Barrio Pendiente Único' }]);
    });

    it.each([
      ['un nombre de barrio con símbolos', { name: '<script>alert(1)</script>' }],
      ['una localidad inexistente', { localityId: '00000000-0000-4000-8000-000000000000' }],
    ])('rechaza %s', async (_case, change) => {
      const payload = customerPayload(uniqueEmail(), localityId);
      const res = await new Client(app).post('/auth/register', {
        ...payload,
        neighborhood: { ...payload.neighborhood, ...change },
      });
      expect(res.status).toBe(400);
    });

    it('rechaza datos de profesional en un registro de cliente', async () => {
      const res = await new Client(app).post('/auth/register', {
        ...customerPayload(uniqueEmail(), localityId),
        serviceAreas: [],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('profesional', () => {
    it('guarda la profesión principal y las zonas; "toda la localidad" absorbe los barrios de esa localidad', async () => {
      const email = uniqueEmail('pro');
      const profession = await professionId(new Client(app));
      const res = await new Client(app).post(
        '/auth/register',
        professionalPayload(email, profession, [
          { localityId, neighborhoodName: 'Alberdi' },
          { localityId },
          { localityId, neighborhoodName: 'Centro' },
        ]),
      );
      expect(res.status).toBe(202);
      const user = await userByEmail(email);
      expect(user.neighborhoodId).toBeNull();
      const profile = await dataSource
        .getRepository(ProfessionalProfile)
        .findOneByOrFail({ userId: user.id });
      await expect(
        dataSource.getRepository(ProfessionalProfession).findBy({ professionalId: profile.id }),
      ).resolves.toEqual([expect.objectContaining({ professionId: profession, isPrimary: true })]);
      await expect(
        dataSource.getRepository(ProfessionalServiceArea).findBy({ professionalId: profile.id }),
      ).resolves.toEqual([expect.objectContaining({ localityId, neighborhoodId: null })]);
    });

    it('guarda barrios sueltos sin repetir', async () => {
      const email = uniqueEmail('pro');
      const profession = await professionId(new Client(app));
      await new Client(app).post(
        '/auth/register',
        professionalPayload(email, profession, [
          { localityId, neighborhoodName: 'San Vicente' },
          { localityId, neighborhoodName: 'san  vicente' },
          { localityId, neighborhoodName: 'Cofico' },
        ]),
      );
      const user = await userByEmail(email);
      const profile = await dataSource
        .getRepository(ProfessionalProfile)
        .findOneByOrFail({ userId: user.id });
      await expect(
        dataSource.getRepository(ProfessionalServiceArea).countBy({ professionalId: profile.id }),
      ).resolves.toBe(2);
    });

    it.each([
      ['sin zonas', []],
      [
        'más de 20 zonas',
        Array.from({ length: 21 }, (_, i) => ({ neighborhoodName: `Barrio Numero ${i}` })),
      ],
    ])('rechaza el registro %s', async (_case, areas) => {
      const profession = await professionId(new Client(app));
      const res = await new Client(app).post(
        '/auth/register',
        professionalPayload(
          uniqueEmail('pro'),
          profession,
          areas.map((area) => ({ localityId, ...area })),
        ),
      );
      expect(res.status).toBe(400);
    });

    it('rechaza una profesión inexistente sin crear nada (transacción)', async () => {
      const email = uniqueEmail('pro');
      const res = await new Client(app).post(
        '/auth/register',
        professionalPayload(email, '00000000-0000-4000-8000-000000000000', [
          { localityId, neighborhoodName: 'Barrio Huérfano' },
        ]),
      );
      expect(res.status).toBe(400);
      await expect(dataSource.getRepository(User).countBy({ email })).resolves.toBe(0);
      await expect(
        dataSource.getRepository(Neighborhood).countBy({ normalizedName: 'barrio huerfano' }),
      ).resolves.toBe(0);
    });
  });

  it('un email ya registrado recibe la misma respuesta y un aviso, sin segunda cuenta', async () => {
    const email = uniqueEmail();
    await new Client(app).post('/auth/register', customerPayload(email, localityId));
    const again = await new Client(app).post(
      '/auth/register',
      customerPayload(email.toUpperCase(), localityId),
    );
    expect(again.status).toBe(202);
    expect(mailbox(app).lastTo(email)?.subject).toBe('Intentaron registrarse con tu email');
    await expect(dataSource.getRepository(User).countBy({ email })).resolves.toBe(1);
  });

  it('audita el registro', async () => {
    const email = uniqueEmail();
    await new Client(app).post('/auth/register', customerPayload(email, localityId));
    const user = await userByEmail(email);
    await expect(
      dataSource
        .getRepository(AdminAuditLog)
        .countBy({ action: 'USER_REGISTERED', targetId: user.id }),
    ).resolves.toBe(1);
  });
});
