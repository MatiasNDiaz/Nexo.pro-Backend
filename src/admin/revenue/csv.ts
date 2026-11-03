/**
 * CSV para abrir con doble clic en Excel en español (ADR 0030): UTF-8 con BOM, separador `;`, coma
 * decimal y saltos de línea CRLF.
 */

/** Un número ya formateado: no pasa por la protección contra fórmulas (puede empezar con "-"). */
export interface CsvNumber {
  number: string;
}

export type CsvCell = string | CsvNumber | null;

const BOM = '﻿';

/** Importe en centavos con coma decimal: 123450 → "1234,50". */
export const csvMoney = (cents: number): CsvNumber => ({
  number: (cents / 100).toFixed(2).replace('.', ','),
});

export const csvInteger = (value: number): CsvNumber => ({ number: String(value) });

/**
 * Texto con comillas si hace falta. Si empieza con `=`, `+`, `-`, `@`, tabulación o retorno de
 * carro, se le antepone un apóstrofo: los nombres los escriben los usuarios y Excel ejecutaría una
 * fórmula (inyección de fórmulas en CSV).
 */
function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'string') return textCell(value);
  return value.number;
}

export function toCsv(header: string[], rows: CsvCell[][]): Buffer {
  const lines = [header.map(textCell), ...rows.map((row) => row.map(cell))].map((r) => r.join(';'));
  return Buffer.from(BOM + lines.join('\r\n') + '\r\n', 'utf8');
}
