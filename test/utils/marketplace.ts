import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { VerificationStatus } from '../../src/users/user.enums';
import { type Client, signInProfessional } from './auth-client';
import { uploadAvatar } from './uploads';

/**
 * Profesional visible en el catálogo (cuenta activa, identidad aprobada, foto, descripción, prueba
 * vigente y toda la localidad de Córdoba), con sesión iniciada. Devuelve también su oficio principal.
 */
export async function listedProfessional(app: NestExpressApplication) {
  const pro = await signInProfessional(app);
  await uploadAvatar(pro.client);
  await app
    .get(DataSource)
    .getRepository(User)
    .update(pro.id, { verificationStatus: VerificationStatus.APPROVED });
  const profile = await pro.client.patch('/professionals/me', { bio: 'Trabajos garantizados' });
  return {
    ...pro,
    professionId: (profile.body as { professions: Array<{ id: string }> }).professions[0].id,
  };
}

/** Abre (o recupera) el chat del cliente con ese profesional. */
export async function openChat(customer: Client, professionalId: string): Promise<string> {
  const res = await customer.post('/chat/conversations', { professionalId });
  if (res.status !== 201) {
    throw new Error(`No se pudo abrir el chat: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { id: string }).id;
}
