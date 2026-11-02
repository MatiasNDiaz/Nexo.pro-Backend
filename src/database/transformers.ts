import { ValueTransformer } from 'typeorm';

/**
 * `numeric` llega del driver como string para no perder precisión. Solo se convierte a número en
 * columnas donde un double alcanza (coordenadas). El dinero se mantiene como string.
 */
export const numericToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
