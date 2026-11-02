import type { IncomingMessage, ServerResponse } from 'http';
import pino from 'pino';
import { Writable } from 'stream';
import { generateRequestId, REDACTED_PATHS, REQUEST_ID_HEADER } from './logger.options';

function captureLog(entry: Record<string, unknown>): string {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  pino({ redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } }, stream).info(entry);
  return lines.join('');
}

describe('redacción del logger', () => {
  it('oculta cookies, autorización, CSRF y Set-Cookie', () => {
    const output = captureLog({
      req: {
        headers: {
          cookie: 'nx_at=jwt-secreto',
          authorization: 'Bearer token-secreto',
          'x-csrf-token': 'csrf-secreto',
        },
      },
      res: { headers: { 'set-cookie': ['nx_rt=refresh-secreto'] } },
    });
    expect(output).not.toMatch(/secreto/);
    expect(output).toContain('[REDACTED]');
  });

  it('oculta contraseñas, tokens y DNI en el primer y segundo nivel', () => {
    const output = captureLog({
      password: 'clave-1',
      token: 'tok-1',
      user: { password: 'clave-2', dni: '12345678', refreshToken: 'rt-1' },
      body: { newPassword: 'clave-3', csrfToken: 'csrf-1' },
    });
    for (const secret of ['clave-1', 'clave-2', 'clave-3', 'tok-1', '12345678', 'rt-1', 'csrf-1']) {
      expect(output).not.toContain(secret);
    }
  });
});

describe('generateRequestId', () => {
  it('genera un UUID propio, lo devuelve en la cabecera e ignora el que manda el cliente', () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => (headers[name] = value) };
    const req = { headers: { 'x-request-id': 'id-del-cliente' } };
    const id = generateRequestId(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(id).not.toBe('id-del-cliente');
    expect(headers[REQUEST_ID_HEADER]).toBe(id);
  });
});
