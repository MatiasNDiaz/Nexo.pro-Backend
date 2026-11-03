/**
 * "Chrome en Windows" a partir del user agent, para el email de dispositivo nuevo (ADR 0031). Una
 * función propia en vez de una librería: alcanza con los navegadores comunes, y la más usada
 * (ua-parser-js 2) tiene licencia AGPL. El orden importa: Edge, Opera y Samsung también dicen
 * "Chrome", y Chrome también dice "Safari".
 */
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\b(OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\b(Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bLinux\b/, 'Linux'],
];

const first = (ua: string, list: Array<[RegExp, string]>) =>
  list.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const browser = first(userAgent, BROWSERS);
  const system = first(userAgent, SYSTEMS);
  if (browser && system) return `${browser} en ${system}`;
  return browser ?? (system ? `Navegador en ${system}` : 'Dispositivo desconocido');
}
