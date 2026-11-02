import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client, lastMailToken, registerCustomer } from './auth-client';

/** PNG real de 1×1 px. */
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export interface UploadTicketBody {
  file: { id: string; status: string; url: string | null };
  upload: { method: string; url: string; fields: Record<string, string>; maxBytes: number };
}

/** Pide un ticket y sube el contenido al adaptador local (sin confirmar). */
export async function uploadRaw(
  client: Client,
  content: Buffer,
  options: { filename?: string; contentType?: string; purpose?: string; kind?: string } = {},
) {
  const created = await client.post('/uploads', {
    purpose: options.purpose ?? 'AVATAR',
    kind: options.kind ?? 'IMAGE',
  });
  if (created.status !== 201) {
    throw new Error(`Ticket falló: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const ticket = created.body as UploadTicketBody;
  const put = await client.agent
    .put(ticket.upload.url)
    .set('X-CSRF-Token', client.csrfToken)
    .attach('file', content, {
      filename: options.filename ?? 'foto.png',
      contentType: options.contentType ?? 'image/png',
    });
  return { ticket, put, fileId: ticket.file.id };
}

/** Sube, confirma y usa una foto de perfil. Devuelve el archivo confirmado. */
export async function uploadAvatar(client: Client) {
  const { fileId } = await uploadRaw(client, PNG_BYTES);
  const completed = await client.post(`/uploads/${fileId}/complete`);
  if (completed.status !== 200) {
    throw new Error(`Confirmación falló: ${completed.status} ${JSON.stringify(completed.body)}`);
  }
  const avatar = await client.put('/users/me/avatar', { fileId });
  if (avatar.status !== 200) {
    throw new Error(`Avatar falló: ${avatar.status} ${JSON.stringify(avatar.body)}`);
  }
  return avatar.body as { id: string; url: string };
}

/**
 * Cliente recién registrado (PENDING_VERIFICATION) con el email verificado y la foto cargada:
 * listo para pedir la verificación de identidad.
 */
export async function customerReadyForVerification(app: NestExpressApplication) {
  const email = await registerCustomer(app);
  const client = new Client(app);
  const token = lastMailToken(app, email);
  const verified = await client.post('/auth/email/verify', { token });
  if (verified.status !== 204) throw new Error(`Verificación de email falló: ${verified.status}`);
  const login = await client.login(email);
  if (login.status !== 200) throw new Error(`Login falló: ${login.status}`);
  const avatar = await uploadAvatar(client);
  const me = await client.get('/auth/me');
  return { client, email, id: (me.body as { id: string }).id, avatar };
}
