import WebSocket from 'ws';

/**
 * Cliente mínimo de Socket.IO v4 sobre `ws` para los tests: manda Origin y Cookie como un navegador
 * (el WebSocket nativo de Node no deja) y entiende lo justo del protocolo: abrir, unirse al
 * namespace, eventos y ping.
 */
export class RealtimeTestClient {
  private readonly events: Array<{ event: string; payload: unknown }> = [];
  private readonly waiters: Array<{ event: string; resolve: (payload: unknown) => void }> = [];
  readonly result: Promise<'connected' | 'rejected'>;
  private socket: WebSocket;

  constructor(baseUrl: string, namespace: string, headers: Record<string, string>) {
    const url = new URL('/socket.io/?EIO=4&transport=websocket', baseUrl);
    url.protocol = 'ws:';
    this.socket = new WebSocket(url, { headers });
    this.result = new Promise((resolve) => {
      this.socket.on('error', () => resolve('rejected'));
      this.socket.on('unexpected-response', () => resolve('rejected'));
      this.socket.on('close', () => resolve('rejected'));
      this.socket.on('message', (raw: Buffer) => {
        const data = raw.toString();
        if (data.startsWith('0')) this.socket.send(`40${namespace},`);
        else if (data === '2') this.socket.send('3');
        else if (data.startsWith(`40${namespace},`)) {
          // El servidor desconecta enseguida si la sesión no es válida: esperamos un momento.
          setTimeout(() => resolve(this.isOpen ? 'connected' : 'rejected'), 300);
        } else if (data.startsWith(`41${namespace}`) || data.startsWith(`44${namespace}`)) {
          resolve('rejected');
          this.close();
        } else if (data.startsWith(`42${namespace},`)) {
          const [event, payload] = JSON.parse(data.slice(`42${namespace},`.length)) as [
            string,
            unknown,
          ];
          const waiter = this.waiters.findIndex((w) => w.event === event);
          if (waiter >= 0) this.waiters.splice(waiter, 1)[0].resolve(payload);
          else this.events.push({ event, payload });
        }
      });
    });
  }

  private disconnected = false;

  get isOpen(): boolean {
    return !this.disconnected && this.socket.readyState === WebSocket.OPEN;
  }

  /** Próximo evento con ese nombre (o uno que ya llegó). */
  next<T>(event: string, timeoutMs = 3000): Promise<T> {
    const index = this.events.findIndex((e) => e.event === event);
    if (index >= 0) return Promise.resolve(this.events.splice(index, 1)[0].payload as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No llegó ${event}`)), timeoutMs);
      this.waiters.push({
        event,
        resolve: (payload) => {
          clearTimeout(timer);
          resolve(payload as T);
        },
      });
    });
  }

  close(): void {
    this.disconnected = true;
    this.socket.close();
  }
}
