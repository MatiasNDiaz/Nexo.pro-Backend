import { CloudflareGeoLocator, EDGE_SECRET_HEADER, NoGeoLocator } from './geo-locator';

const SECRET = 'secreto-de-cloudflare-0000000000000000';
const locator = new CloudflareGeoLocator(SECRET);
/** Así llega a Node una ciudad con tildes que Cloudflare mandó en UTF-8. */
const asLatin1 = (text: string) => Buffer.from(text, 'utf8').toString('latin1');

describe('Ubicación aproximada (ADR 0031)', () => {
  it('con el secreto de Cloudflare: ciudad y provincia, con tildes', () => {
    expect(
      locator.approximateLocation({
        [EDGE_SECRET_HEADER]: SECRET,
        'cf-ipcity': asLatin1('Río Cuarto'),
        'cf-region': asLatin1('Córdoba'),
        'cf-ipcountry': 'AR',
      }),
    ).toBe('Río Cuarto, Córdoba');
  });

  it('fuera de la Argentina aclara el país; sin provincia, solo la ciudad', () => {
    expect(
      locator.approximateLocation({
        [EDGE_SECRET_HEADER]: SECRET,
        'cf-ipcity': 'Montevideo',
        'cf-ipcountry': 'UY',
      }),
    ).toBe('Montevideo (UY)');
  });

  it('sin el secreto (o con otro) no confía en los encabezados', () => {
    const forged = { 'cf-ipcity': 'Córdoba', 'cf-region': 'Córdoba' };
    expect(locator.approximateLocation(forged)).toBeNull();
    expect(
      locator.approximateLocation({ ...forged, [EDGE_SECRET_HEADER]: 'otro-secreto' }),
    ).toBeNull();
  });

  it('limpia lo que no es texto de una ciudad y corta los largos', () => {
    expect(
      locator.approximateLocation({
        [EDGE_SECRET_HEADER]: SECRET,
        'cf-ipcity': 'Villa <script>Carlos</script> Paz\n',
      }),
    ).toBe('Villa scriptCarlosscript Paz');
    expect(
      locator.approximateLocation({ [EDGE_SECRET_HEADER]: SECRET, 'cf-ipcity': 'x'.repeat(200) }),
    ).toHaveLength(60);
  });

  it('sin fuente configurada, nunca hay ubicación', () => {
    expect(new NoGeoLocator().approximateLocation()).toBeNull();
  });
});
