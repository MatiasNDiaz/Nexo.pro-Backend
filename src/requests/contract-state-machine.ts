import { ContractStatus as S } from './request.enums';

export type ContractActor = 'CUSTOMER' | 'PROFESSIONAL';
export type ContractAction = 'SCHEDULE' | 'START' | 'COMPLETE' | 'CANCEL';

interface Rule {
  from: readonly S[];
  to: (actor: ContractActor) => S;
  actors: readonly ContractActor[];
}

const OPEN: readonly S[] = [S.ACCEPTED, S.SCHEDULED, S.IN_PROGRESS];

/**
 * Transiciones de la contratación (ADR 0025, FI §11.3 y §11.4). Solo el profesional avanza; los dos
 * pueden cancelar mientras no terminó. Cualquier otra combinación responde 409.
 */
const RULES: Record<ContractAction, Rule> = {
  SCHEDULE: { from: [S.ACCEPTED, S.SCHEDULED], to: () => S.SCHEDULED, actors: ['PROFESSIONAL'] },
  START: { from: [S.ACCEPTED, S.SCHEDULED], to: () => S.IN_PROGRESS, actors: ['PROFESSIONAL'] },
  // No hace falta que el cliente confirme (FI §11.4).
  COMPLETE: { from: OPEN, to: () => S.COMPLETED, actors: ['PROFESSIONAL'] },
  CANCEL: {
    from: OPEN,
    to: (actor) => (actor === 'CUSTOMER' ? S.CANCELLED_BY_CLIENT : S.CANCELLED_BY_PRO),
    actors: ['CUSTOMER', 'PROFESSIONAL'],
  },
};

/** Estado al que lleva la acción, o null si no está permitida desde ese estado para ese actor. */
export function nextContractStatus(
  current: S,
  action: ContractAction,
  actor: ContractActor,
): S | null {
  const rule = RULES[action];
  if (!rule.actors.includes(actor) || !rule.from.includes(current)) return null;
  return rule.to(actor);
}

export const isOpenContract = (status: S) => OPEN.includes(status);
