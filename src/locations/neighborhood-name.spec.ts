import {
  displayNeighborhoodName,
  neighborhoodNameProblem,
  normalizeNeighborhoodName,
} from './neighborhood-name';

describe('nombres de barrios (ADR 0010)', () => {
  it.each([
    ['  Nueva  CÓRDOBA ', 'nueva cordoba'],
    ['nueva cordoba', 'nueva cordoba'],
    ['Güemes', 'guemes'],
    ['Gral. Paz', 'gral paz'],
    ['Villa El-Libertador', 'villa el libertador'],
    ['Barrio Ñu Porá', 'barrio nu pora'],
  ])('normaliza "%s" como "%s"', (raw, expected) => {
    expect(normalizeNeighborhoodName(raw)).toBe(expected);
  });

  it.each([
    ['nueva córdoba', 'Nueva Córdoba'],
    ['CERRO DE LAS ROSAS', 'Cerro de las Rosas'],
    ['  alta   cordoba ', 'Alta Cordoba'],
    ['San Vicente', 'San Vicente'],
    ['barrio JARDÍN espinosa', 'barrio JARDÍN espinosa'],
  ])('muestra "%s" como "%s"', (raw, expected) => {
    expect(displayNeighborhoodName(raw)).toBe(expected);
  });

  it.each([
    ['A', 'caracteres'],
    ['x'.repeat(61), 'caracteres'],
    ['<script>', 'letras'],
    ['Centro; DROP TABLE', 'letras'],
    ['--', 'no es válido'],
  ])('rechaza "%s"', (raw, reason) => {
    expect(neighborhoodNameProblem(raw)).toContain(reason);
  });

  it('acepta nombres reales con tildes, números y apóstrofos', () => {
    for (const name of ['Nueva Córdoba', 'Barrio 25 de Mayo', "Villa O'Higgins", 'Güemes']) {
      expect(neighborhoodNameProblem(name)).toBeNull();
    }
  });
});
