import { nextContractStatus } from './contract-state-machine';
import { ContractStatus as S } from './request.enums';

describe('máquina de estados de la contratación (ADR 0025)', () => {
  it('solo el profesional avanza: agendar, empezar y terminar', () => {
    expect(nextContractStatus(S.ACCEPTED, 'SCHEDULE', 'PROFESSIONAL')).toBe(S.SCHEDULED);
    expect(nextContractStatus(S.SCHEDULED, 'SCHEDULE', 'PROFESSIONAL')).toBe(S.SCHEDULED);
    expect(nextContractStatus(S.SCHEDULED, 'START', 'PROFESSIONAL')).toBe(S.IN_PROGRESS);
    expect(nextContractStatus(S.ACCEPTED, 'COMPLETE', 'PROFESSIONAL')).toBe(S.COMPLETED);
    expect(nextContractStatus(S.IN_PROGRESS, 'COMPLETE', 'PROFESSIONAL')).toBe(S.COMPLETED);
    expect(nextContractStatus(S.ACCEPTED, 'START', 'CUSTOMER')).toBeNull();
    expect(nextContractStatus(S.IN_PROGRESS, 'SCHEDULE', 'PROFESSIONAL')).toBeNull();
  });

  it('los dos cancelan mientras no terminó; lo terminado o cancelado no se mueve', () => {
    expect(nextContractStatus(S.IN_PROGRESS, 'CANCEL', 'CUSTOMER')).toBe(S.CANCELLED_BY_CLIENT);
    expect(nextContractStatus(S.ACCEPTED, 'CANCEL', 'PROFESSIONAL')).toBe(S.CANCELLED_BY_PRO);
    for (const done of [S.COMPLETED, S.CANCELLED_BY_CLIENT, S.CANCELLED_BY_PRO]) {
      for (const action of ['SCHEDULE', 'START', 'COMPLETE', 'CANCEL'] as const) {
        expect(nextContractStatus(done, action, 'PROFESSIONAL')).toBeNull();
        expect(nextContractStatus(done, action, 'CUSTOMER')).toBeNull();
      }
    }
  });
});
