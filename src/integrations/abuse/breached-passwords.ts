import { createHash } from 'node:crypto';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3000;

/**
 * ¿La contraseña aparece en filtraciones conocidas? Usa Have I Been Pwned con k-anonimato: solo
 * viajan los primeros 5 caracteres del SHA-1, nunca la contraseña ni el hash completo. Con
 * relleno (`Add-Padding`) la respuesta no revela cuál se consultó.
 * Devuelve null si el servicio no respondió: el llamador decide (se deja pasar, ADR 0011).
 */
export async function isPasswordBreached(
  password: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean | null> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetchFn(`${RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.text();
    return body.split('\n').some((line) => {
      const [hash, count] = line.trim().split(':');
      // El relleno agrega líneas con conteo 0: no son filtraciones reales.
      return hash === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}
