import type { IncomingHttpHeaders } from 'node:http';
import { safeEqual } from '../../common/crypto/crypto.utils';

/**
 * Ubicación aproximada de quien hace la request (ADR 0031). Solo para el email de dispositivo
 * nuevo: se calcula, se usa y se descarta (nunca se guarda ni se loguea).
 */
export const GEO_LOCATOR = Symbol('GEO_LOCATOR');

export interface GeoLocator {
  /** "Córdoba, Córdoba" o null si no está disponible. */
  approximateLocation(headers: IncomingHttpHeaders): string | null;
}

/** Encabezado secreto que agrega Cloudflare con una regla de transformación. */
export const EDGE_SECRET_HEADER = 'x-nexo-edge-secret';

const MAX_LENGTH = 60;

/** Sin fuente de ubicación: el email dice "ubicación no disponible". */
export class NoGeoLocator implements GeoLocator {
  approximateLocation(): string | null {
    return null;
  }
}

/**
 * Cloudflare (encabezados de ubicación del visitante: `cf-ipcity`, `cf-region`, `cf-ipcountry`).
 * Cualquiera puede inventar esos encabezados si llega directo a la API, así que solo se creen si
 * la request trae además el secreto que agrega Cloudflare.
 */
export class CloudflareGeoLocator implements GeoLocator {
  constructor(private readonly edgeSecret: string) {}

  approximateLocation(headers: IncomingHttpHeaders): string | null {
    const secret = header(headers, EDGE_SECRET_HEADER);
    if (!secret || !safeEqual(secret, this.edgeSecret)) return null;
    const city = clean(header(headers, 'cf-ipcity'));
    if (!city) return null;
    const region = clean(header(headers, 'cf-region'));
    const country = clean(header(headers, 'cf-ipcountry'))?.toUpperCase();
    const place = region && region !== city ? `${city}, ${region}` : city;
    // Fuera de la Argentina se aclara el país (un aviso desde otro país llama más la atención).
    return country && country !== 'AR' && /^[A-Z]{2}$/.test(country)
      ? `${place} (${country})`
      : place;
  }
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Node lee los encabezados como latin1: una ciudad con tildes que vino en UTF-8 llega como
 * "CÃ³rdoba". Se reinterpreta y se dejan solo letras, espacios y signos comunes.
 */
function clean(value: string | null): string | null {
  if (!value) return null;
  let text = value;
  if (/[\u0080-ÿ]/.test(text)) {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (!decoded.includes('�')) text = decoded;
  }
  text = text
    .replace(/[^\p{L}\p{M}\p{N} .,'()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, MAX_LENGTH) : null;
}
