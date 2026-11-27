import { describe, it, expect } from 'vitest';
import { readImageInfo } from '../src/utils/imageInfo.js';

describe('readImageInfo', () => {
  it('reads PNG, JPEG (after APP segments), WebP VP8X/VP8L, GIF and recognises PDF', () => {
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(3000, 16);
    png.writeUInt32BE(2000, 20);
    expect(readImageInfo(png)).toEqual({ format: 'png', width: 3000, height: 2000 });

    // SOI, APP0 (16 bytes), SOF0 with height 1200 / width 1600.
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
    const sof0 = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(readImageInfo(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]))).toEqual({ format: 'jpeg', width: 1600, height: 1200 });

    const vp8x = Buffer.alloc(30);
    vp8x.write('RIFF', 0, 'ascii');
    vp8x.write('WEBP', 8, 'ascii');
    vp8x.write('VP8X', 12, 'ascii');
    vp8x.writeUIntLE(2048 - 1, 24, 3);
    vp8x.writeUIntLE(1024 - 1, 27, 3);
    expect(readImageInfo(vp8x)).toEqual({ format: 'webp', width: 2048, height: 1024 });

    const vp8l = Buffer.alloc(30);
    vp8l.write('RIFF', 0, 'ascii');
    vp8l.write('WEBP', 8, 'ascii');
    vp8l.write('VP8L', 12, 'ascii');
    vp8l.writeUInt32LE((800 - 1) | ((600 - 1) << 14), 21);
    expect(readImageInfo(vp8l)).toEqual({ format: 'webp', width: 800, height: 600 });

    const gif = Buffer.alloc(13);
    gif.write('GIF89a', 0, 'ascii');
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(240, 8);
    expect(readImageInfo(gif)).toEqual({ format: 'gif', width: 320, height: 240 });

    expect(readImageInfo(Buffer.from('%PDF-1.7\n%…………'))).toEqual({ format: 'pdf' });
    expect(readImageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});
