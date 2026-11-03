import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { SessionsService } from '../auth/services/sessions.service';
import { TokenService } from '../auth/services/token.service';
import { type AuthConfig, authConfig } from '../config/auth.config';

/** Cada cuánto se revisa que la sesión de cada conexión siga viva (logout, suspensión, baja). */
const REVALIDATE_MS = 60_000;

export const userRoom = (userId: string) => `user:${userId}`;

interface SocketSession {
  userId: string;
  sid: string;
}

/** Lee una cookie del header de la conexión (las de la API son HttpOnly: el navegador las manda). */
function cookieFrom(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(value.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Tiempo real (ADR 0024). Solo avisa: los mensajes se envían por la API REST. La conexión se
 * autentica con la cookie de acceso (mismas reglas que HTTP) y cada usuario entra a su sala. El
 * origen lo valida el adaptador (`RealtimeAdapter`).
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private timer: NodeJS.Timeout | null = null;

  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  afterInit(): void {
    this.timer = setInterval(() => void this.revalidateAll(), REVALIDATE_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const session = await this.authenticate(socket);
    if (!session) {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return;
    }
    (socket.data as { session?: SocketSession }).session = session;
    await socket.join(userRoom(session.userId));
  }

  handleDisconnect(): void {
    // Socket.IO saca al socket de sus salas solo.
  }

  /** ¿Tiene la app abierta en algún dispositivo? Entonces no hace falta el push (ADR 0032). */
  async isOnline(userId: string): Promise<boolean> {
    if (!this.server) return false;
    return (await this.server.in(userRoom(userId)).fetchSockets()).length > 0;
  }

  /** Avisa a todas las conexiones de ese usuario. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  private async authenticate(socket: Socket): Promise<SocketSession | null> {
    const token = cookieFrom(socket.handshake.headers.cookie, this.config.cookies.names.access);
    if (!token) return null;
    const verified = await this.tokens.verifyAccessToken(token);
    if (!verified) return null;
    const user = await this.sessions.resolveAuthUser(verified.sid, verified.userId);
    return user ? { userId: user.id, sid: verified.sid } : null;
  }

  /** Corta las conexiones cuya sesión se cerró (logout, revocación, suspensión, baja). */
  private async revalidateAll(): Promise<void> {
    try {
      const sockets = await this.server.fetchSockets();
      for (const socket of sockets) {
        const session = (socket.data as { session?: SocketSession }).session;
        const alive = session && (await this.sessions.resolveAuthUser(session.sid, session.userId));
        if (!alive) socket.disconnect(true);
      }
    } catch (error) {
      this.logger.warn(`No se pudieron revisar las conexiones: ${(error as Error).message}`);
    }
  }
}
