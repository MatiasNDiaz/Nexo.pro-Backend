import { detectMimeType, mp4DurationMs } from './media-inspection';

const PNG_HEAD = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG_HEAD = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');

function box(type: string, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
}

/** MP4 mínimo: ftyp + moov/mvhd (versión 0) con la escala y duración dadas. */
function fakeMp4(durationMs: number, timescale = 1000): Buffer {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(Math.round((durationMs / 1000) * timescale), 16);
  const ftyp = box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1'));
  return Buffer.concat([ftyp, box('moov', box('mvhd', mvhd))]);
}

describe('media-inspection', () => {
  it('detecta el tipo real por magic bytes', async () => {
    expect(await detectMimeType(PNG_HEAD)).toBe('image/png');
    expect(await detectMimeType(JPEG_HEAD)).toBe('image/jpeg');
    expect(await detectMimeType(fakeMp4(5000))).toBe('video/mp4');
    expect(await detectMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).not.toBe(
      'image/png',
    );
    expect(await detectMimeType(Buffer.from('hola, no soy una imagen'))).toBeNull();
  });

  it('lee la duración de un MP4 desde mvhd', () => {
    expect(mp4DurationMs(fakeMp4(15000))).toBe(15000);
    expect(mp4DurationMs(fakeMp4(16500, 600))).toBe(16500);
  });

  it('devuelve null si no hay estructura MP4 válida', () => {
    expect(mp4DurationMs(PNG_HEAD)).toBeNull();
    const truncated = fakeMp4(5000).subarray(0, 40);
    expect(mp4DurationMs(truncated)).toBeNull();
  });
});
