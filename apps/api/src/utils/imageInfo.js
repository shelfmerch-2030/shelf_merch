/**
 * Read an image's format and pixel size from the first bytes of the file (no decoding, no dependency).
 * Supports PNG, JPEG, WebP (VP8 / VP8L / VP8X), GIF; PDF is recognised (vector — no pixel size).
 * Returns { format, width, height } or { format } for PDF, or null when unrecognised / truncated.
 */
export function readImageInfo(buf) {
  if (!buf || buf.length < 12) return null;

  // PNG: signature + IHDR (width/height at 16/20).
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.length >= 24) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF87a / GIF89a: logical screen size, little-endian.
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // PDF: vector/print-ready; no intrinsic pixel size.
  if (buf.toString('ascii', 0, 5) === '%PDF-') return { format: 'pdf' };

  // WebP: RIFF....WEBP + chunk.
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.length >= 30) {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    return null;
  }

  // JPEG: walk segments to the first SOFn marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) return null;
      const marker = buf[o + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        o += 2;
        continue;
      }
      const len = buf.readUInt16BE(o + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) return { format: 'jpeg', width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5) };
      o += 2 + len;
    }
    return null;
  }
  return null;
}
