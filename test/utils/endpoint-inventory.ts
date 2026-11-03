import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ALLOWED_ACCOUNT_STATES_KEY,
  IS_PUBLIC_KEY,
  ROLES_KEY,
  SKIP_CSRF_KEY,
  SKIP_ORIGIN_CHECK_KEY,
} from '../../src/common/decorators';

/** Lo que hacen cumplir los guards globales en una ruta (ADR 0007, plan §9.8). */
export interface Endpoint {
  method: string;
  path: string;
  controller: string;
  public: boolean;
  /** Vacío = cualquier rol autenticado. */
  roles: string[];
  states: string[];
  /** Token CSRF: métodos que modifican datos con sesión (la ruta pública no tiene sesión). */
  csrf: boolean;
  /** Origin + X-Requested-With en métodos que modifican datos. */
  originCheck: boolean;
  /** Límite propio (por minuto u hora); si no, el global. */
  throttle: string | null;
}

type Target = object | ((...args: unknown[]) => unknown);
const meta = <T>(key: string, ...targets: Target[]): T | undefined => {
  for (const target of targets) {
    const value = Reflect.getMetadata(key, target) as T | undefined;
    if (value !== undefined) return value;
  }
  return undefined;
};

const join = (...parts: string[]) =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`;

/** Recorre los controladores registrados y arma una fila por cada ruta. */
export function endpointInventory(app: NestExpressApplication, prefix = 'api'): Endpoint[] {
  const endpoints: Endpoint[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: unknown[]) => object) | null;
      if (!controller) continue;
      const base = meta<string | string[]>(PATH_METADATA, controller) ?? '';
      const version = meta<string>(VERSION_METADATA, controller);
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = meta<string | string[]>(PATH_METADATA, handler);
        const method = meta<RequestMethod>(METHOD_METADATA, handler);
        if (path === undefined || method === undefined) continue;
        const verb = RequestMethod[method];
        const isPublic = meta<boolean>(IS_PUBLIC_KEY, handler, controller) === true;
        const safe = verb === 'GET';
        // @Throttle({ default: … }) guarda `THROTTLER:LIMITdefault` y `THROTTLER:TTLdefault`.
        const limit = (Reflect.getMetadataKeys(handler) as string[]).find((key) =>
          key.startsWith('THROTTLER:LIMIT'),
        );
        const ttlKey = limit?.replace('LIMIT', 'TTL');
        endpoints.push({
          method: verb,
          path: join(prefix, version ? `v${version}` : '', String(base), String(path)),
          controller: controller.name,
          public: isPublic,
          roles: meta<string[]>(ROLES_KEY, handler, controller) ?? [],
          states: meta<string[]>(ALLOWED_ACCOUNT_STATES_KEY, handler, controller) ?? ['ACTIVE'],
          csrf: !safe && !isPublic && meta<boolean>(SKIP_CSRF_KEY, handler, controller) !== true,
          originCheck: !safe && meta<boolean>(SKIP_ORIGIN_CHECK_KEY, handler, controller) !== true,
          throttle:
            limit && ttlKey
              ? `${meta<number>(limit, handler)}/${(meta<number>(ttlKey, handler) ?? 0) >= 3_600_000 ? 'h' : 'min'}`
              : null,
        });
      }
    }
  }
  return endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Tabla Markdown para `docs/endpoints.md`. */
export function inventoryMarkdown(endpoints: Endpoint[]): string {
  const rows = endpoints.map((e) =>
    [
      `\`${e.method} ${e.path}\``,
      e.public ? 'Público' : e.roles.length ? e.roles.join(', ') : 'Cualquier rol',
      e.public ? '—' : e.states.join(', '),
      e.method === 'GET' ? '—' : e.csrf ? 'Sí' : 'No',
      e.method === 'GET' ? '—' : e.originCheck ? 'Sí' : 'No (firma)',
      e.throttle ?? 'global',
    ].join(' | '),
  );
  return [
    '# Inventario de endpoints',
    '',
    'Generado desde las rutas que registra la app; `test/endpoint-inventory.e2e-spec.ts` falla si',
    'queda desactualizado (se regenera con `UPDATE_ENDPOINTS=1 npm run test:e2e -- endpoint-inventory`).',
    'Lo que hacen cumplir los guards globales en cada ruta: autenticación,',
    'rol, estados de cuenta admitidos, token CSRF, Origin y límite de pedidos. La propiedad de cada',
    'recurso (anti-IDOR) la valida cada servicio; ver `docs/revision-seguridad.md`.',
    '',
    '| Ruta | Rol | Estados de cuenta | CSRF | Origin | Límite |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
    '',
  ].join('\n');
}
