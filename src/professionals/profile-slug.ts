import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const SUFFIX_LENGTH = 5;
const BASE_MAX = 60;

/** Parte legible del slug: "Juan Pérez" → `juan-perez`. Sin tildes ni signos. */
export function slugBase(...parts: string[]): string {
  const base = parts
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BASE_MAX)
    .replace(/-+$/g, '');
  return base || 'profesional';
}

/**
 * URL pública del perfil: nombre + sufijo aleatorio (`juan-perez-k7m2q`). El sufijo evita choques y
 * que se pueda adivinar el perfil de alguien por su nombre.
 */
export function profileSlug(firstName: string, lastName: string): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `${slugBase(firstName, lastName)}-${suffix}`;
}
