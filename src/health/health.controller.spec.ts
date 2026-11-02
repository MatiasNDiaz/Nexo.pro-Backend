import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

function controllerWith(query: () => Promise<unknown>): HealthController {
  return new HealthController({ query } as unknown as DataSource);
}

describe('HealthController', () => {
  it('ready responde ok si la base contesta', async () => {
    await expect(controllerWith(() => Promise.resolve([{}])).ready()).resolves.toEqual({
      status: 'ok',
    });
  });

  it('ready responde 503 si la base falla, sin exponer el error', async () => {
    const failing = controllerWith(() => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:5432')));
    const error: unknown = await failing.ready().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).not.toContain('10.0.0.5');
  });

  it('ready responde 503 si la base no contesta a tiempo', async () => {
    jest.useFakeTimers();
    try {
      const pending = controllerWith(() => new Promise(() => undefined)).ready();
      jest.advanceTimersByTime(2001);
      await expect(pending).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      jest.useRealTimers();
    }
  });
});
