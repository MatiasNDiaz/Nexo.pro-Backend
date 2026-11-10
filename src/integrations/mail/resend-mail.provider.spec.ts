import { MailDeliveryError, ResendMailProvider } from './resend-mail.provider';

const message = {
  to: 'ana@example.com',
  subject: 'Verificá tu email',
  text: 'Enlace: https://x/?token=secreto',
};

function fakeFetch(response: { status: number; body?: unknown } | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(
      new Response(JSON.stringify(response.body ?? {}), { status: response.status }),
    );
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('ResendMailProvider (ADR 0035)', () => {
  it('manda el email a la API de Resend con la clave y el remitente', async () => {
    const { fn, calls } = fakeFetch({ status: 200, body: { id: 'email-1' } });
    await new ResendMailProvider(
      're_clave_de_prueba_123456789',
      'Repara Ya <hola@reparaya.com.ar>',
      fn,
    ).send(message);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_clave_de_prueba_123456789');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      from: 'Repara Ya <hola@reparaya.com.ar>',
      to: ['ana@example.com'],
      subject: 'Verificá tu email',
      text: 'Enlace: https://x/?token=secreto',
    });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('si Resend rechaza, el error dice el estado y el nombre, nunca el contenido', async () => {
    const { fn } = fakeFetch({
      status: 422,
      body: {
        name: 'validation_error',
        message: 'El dominio no está verificado: hola@reparaya.com.ar',
      },
    });
    const error = await new ResendMailProvider('re_clave_de_prueba_123456789', 'x <a@b.c>', fn)
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).status).toBe(422);
    expect((error as Error).message).toBe(
      'El proveedor de email rechazó el envío (422, validation_error).',
    );
    expect((error as Error).message).not.toContain('secreto');
  });

  it('sin respuesta (red caída o tiempo agotado), un error sin detalles', async () => {
    const { fn } = fakeFetch(new Error('ECONNRESET https://api.resend.com con la clave'));
    const error = await new ResendMailProvider('re_clave_de_prueba_123456789', 'x <a@b.c>', fn)
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as Error).message).toBe('El proveedor de email no respondió.');
  });
});
