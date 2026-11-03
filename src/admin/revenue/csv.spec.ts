import { csvInteger, csvMoney, toCsv } from './csv';

describe('CSV del panel de ingresos', () => {
  it('UTF-8 con BOM, separador ; y coma decimal', () => {
    const csv = toCsv(['Nombre', 'Monto'], [['José Pérez', csvMoney(1_500_050)]]);
    expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(csv.toString('utf8').slice(1)).toBe('Nombre;Monto\r\nJosé Pérez;15000,50\r\n');
  });

  it('pone entre comillas lo que tiene ; comillas o saltos de línea', () => {
    const csv = toCsv(['A'], [['Pérez; "el Tano"'], ['dos\nlíneas'], [null]]);
    expect(csv.toString('utf8').slice(1)).toBe(
      'A\r\n"Pérez; ""el Tano"""\r\n"dos\nlíneas"\r\n\r\n',
    );
  });

  it('neutraliza fórmulas en el texto, pero no en los números negativos', () => {
    const csv = toCsv(
      ['A', 'B', 'C', 'D'],
      [
        ['=HYPERLINK("x")', '+54 11', '@SUMA', csvMoney(-2500)],
        ['-1', csvInteger(-3), 'ok', null],
      ],
    );
    expect(csv.toString('utf8').slice(1)).toBe(
      `A;B;C;D\r\n"'=HYPERLINK(""x"")";'+54 11;'@SUMA;-25,00\r\n'-1;-3;ok;\r\n`,
    );
  });
});
