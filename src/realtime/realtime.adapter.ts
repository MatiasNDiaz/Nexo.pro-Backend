import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO con la misma política de orígenes que la API: CORS con credenciales solo para
 * FRONTEND_ORIGINS y, además, se rechaza la conexión si el header Origin no está en la lista (evita
 * que otro sitio abra una conexión con la cookie del usuario).
 */
export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: readonly string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const settings: Partial<ServerOptions> = {
      ...options,
      cors: { origin: [...this.origins], credentials: true },
      allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        callback(null, typeof origin === 'string' && this.origins.includes(origin));
      },
      // Solo avisos chicos: un mensaje grande es un error o un abuso.
      maxHttpBufferSize: 16 * 1024,
    };
    return super.createIOServer(port, settings as ServerOptions);
  }
}
