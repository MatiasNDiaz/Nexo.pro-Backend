import { fileTypeFromBuffer } from 'file-type';

/** Tipo real según los primeros bytes (magic bytes), sin mirar la extensión ni el Content-Type. */
export async function detectMimeType(head: Uint8Array): Promise<string | null> {
  const detected = await fileTypeFromBuffer(head);
  return detected?.mime ?? null;
}

const BOX_HEADER = 8;

/**
 * Duración de un MP4/MOV en milisegundos, leída de la caja `moov/mvhd` (ISO/IEC 14496-12).
 * Devuelve null si el archivo no tiene esa estructura. Solo lo usa el adaptador local: Cloudinary
 * informa la duración al consultarlo.
 */
export function mp4DurationMs(data: Uint8Array): number | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const moov = findBox(view, 0, data.byteLength, 'moov');
  if (!moov) return null;
  const mvhd = findBox(view, moov.contentStart, moov.end, 'mvhd');
  if (!mvhd) return null;

  const at = mvhd.contentStart;
  if (at + 4 > mvhd.end) return null;
  const version = view.getUint8(at);
  // version 0: creation(4) modification(4) timescale(4) duration(4)
  // version 1: creation(8) modification(8) timescale(4) duration(8)
  const timescaleAt = at + 4 + (version === 1 ? 16 : 8);
  const durationAt = timescaleAt + 4;
  if (durationAt + (version === 1 ? 8 : 4) > mvhd.end) return null;
  const timescale = view.getUint32(timescaleAt);
  const duration =
    version === 1 ? Number(view.getBigUint64(durationAt)) : view.getUint32(durationAt);
  if (!timescale) return null;
  return Math.round((duration / timescale) * 1000);
}

interface Box {
  contentStart: number;
  end: number;
}

function findBox(view: DataView, start: number, end: number, type: string): Box | null {
  let offset = start;
  while (offset + BOX_HEADER <= end) {
    let size = view.getUint32(offset);
    const name = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    let header = BOX_HEADER;
    if (size === 1) {
      // Tamaño extendido de 64 bits.
      if (offset + 16 > end) return null;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset; // la caja llega hasta el final
    }
    if (size < header || offset + size > end) return null;
    if (name === type) return { contentStart: offset + header, end: offset + size };
    offset += size;
  }
  return null;
}
