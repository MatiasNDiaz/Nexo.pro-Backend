import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorBody } from '../errors/api-error';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(
  exception: unknown,
  requestId: unknown = 'req-123',
): { status: number; body: ApiErrorBody } {
  const result = { status: 0, body: undefined as unknown as ApiErrorBody };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: ApiErrorBody) {
      result.body = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ id: requestId }), getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return result;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('respeta el código y los detalles que trae la excepción', () => {
    const { status, body } = run(
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Los datos enviados no son válidos.',
        details: [{ field: 'email', errors: ['email must be an email'] }],
      }),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'email', errors: ['email must be an email'] }],
      requestId: 'req-123',
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('usa un código por defecto según el status', () => {
    const { body } = run(new NotFoundException());
    expect(body.code).toBe('NOT_FOUND');
    expect(body.details).toEqual([]);
  });

  it('no expone el mensaje de un error inesperado y lo registra en el log', () => {
    const { status, body } = run(new Error('relation "users" does not exist at SELECT ...'));
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('oculta también el mensaje de una HttpException 5xx', () => {
    const { body } = run(new InternalServerErrorException('detalle interno de la base'));
    expect(body.message).not.toContain('detalle interno');
  });

  it('traduce errores de body-parser (http-errors con expose) a 4xx', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });
    const { status, body } = run(tooLarge);
    expect(status).toBe(413);
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('trata como 500 un error con status 4xx que no es seguro de exponer', () => {
    const hidden = Object.assign(new Error('x'), { status: 400, expose: false });
    expect(run(hidden).status).toBe(500);
  });

  it('acepta un status personalizado de HttpException', () => {
    const { status, body } = run(
      new HttpException({ code: 'PLAN_LIMIT_REACHED', message: 'Límite' }, 422),
    );
    expect(status).toBe(422);
    expect(body.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('devuelve requestId null si la request no tiene id', () => {
    expect(run(new NotFoundException(), null).body.requestId).toBeNull();
  });
});
