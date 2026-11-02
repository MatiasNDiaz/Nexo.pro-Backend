import { SocialNetwork } from './professional.enums';

/** Dominios admitidos por red. La web propia admite cualquier dominio https. */
const HOSTS: Record<SocialNetwork, readonly string[] | null> = {
  [SocialNetwork.INSTAGRAM]: ['instagram.com'],
  [SocialNetwork.FACEBOOK]: ['facebook.com', 'fb.com'],
  [SocialNetwork.TIKTOK]: ['tiktok.com'],
  [SocialNetwork.LINKEDIN]: ['linkedin.com'],
  [SocialNetwork.YOUTUBE]: ['youtube.com', 'youtu.be'],
  [SocialNetwork.WEBSITE]: null,
};

/**
 * Valida y normaliza el enlace de una red: https, sin usuario ni contraseña en la URL y del
 * dominio de esa red. Devuelve la URL normalizada o null si no es válida.
 */
export function normalizeSocialUrl(network: SocialNetwork, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return null;
  const allowed = HOSTS[network];
  if (allowed && !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return null;
  }
  url.hash = '';
  const normalized = url.toString();
  return normalized.length <= 300 ? normalized : null;
}
