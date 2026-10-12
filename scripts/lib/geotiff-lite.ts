/**
 * A small GeoTIFF reader for the elevation sources of maps v5 (ETOPO 2022, SRTM GL1): one band,
 * stripped or tiled, uncompressed, deflate or LZW, with no predictor, the horizontal predictor (2) or the
 * floating-point predictor (3); sample types int16, uint16, int32 and float32. Enough for these two
 * datasets; not a general TIFF library. No dependencies beyond node's zlib.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export type Raster = {
  w: number;
  h: number;
  /** degrees: [lon of the west edge, lat of the north edge, pixel width, pixel height] */
  geo: [number, number, number, number];
  nodata: number | null;
  data: Float32Array;
};

type Tag = { type: number; count: number; values: number[]; text?: string };

function readTags(buf: Buffer): { le: boolean; tags: Map<number, Tag> } {
  const le = buf.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('not a classic TIFF (BigTIFF is not supported)');
  const ifd = u32(4), n = u16(ifd), tags = new Map<number, Tag>();
  const size: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    const bytes = (size[type] ?? 1) * count, at = bytes <= 4 ? e + 8 : u32(e + 8);
    const values: number[] = [];
    let text: string | undefined;
    if (type === 2) text = buf.toString('latin1', at, at + count).replace(/\0+$/, '');
    else
      for (let k = 0; k < count; k++) {
        const o = at + k * size[type];
        values.push(type === 3 ? u16(o) : type === 4 ? u32(o) : type === 12 ? (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o)) : type === 11 ? (le ? buf.readFloatLE(o) : buf.readFloatBE(o)) : type === 8 ? (le ? buf.readInt16LE(o) : buf.readInt16BE(o)) : buf[o]);
      }
    tags.set(tag, { type, count, values, text });
  }
  return { le, tags };
}

function lzw(src: Buffer, outLen: number): Buffer {
  const out = Buffer.alloc(outLen);
  let op = 0, bit = 0, width = 9;
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push([], []); width = 9; };
  reset();
  const read = () => {
    let v = 0;
    for (let i = 0; i < width; i++) { const b = (src[(bit + i) >> 3] >> (7 - ((bit + i) & 7))) & 1; v = (v << 1) | b; }
    bit += width;
    return v;
  };
  let prev: number[] | null = null;
  while (bit + width <= src.length * 8) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { reset(); prev = null; continue; }
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else break;
    for (const b of entry) if (op < outLen) out[op++] = b;
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length + 1 >= 1 << width && width < 12) width++;
  }
  return out;
}

/** Read a whole single-band GeoTIFF into float32 (nodata kept as its value). */
export function readGeoTiff(path: string): Raster {
  const buf = readFileSync(path);
  const { le, tags } = readTags(buf);
  const v = (t: number, d?: number) => tags.get(t)?.values[0] ?? d!;
  const w = v(256), h = v(257), bits = v(258), comp = v(259, 1), pred = v(317, 1), fmt = v(339, 1);
  const tiled = tags.has(322);
  const tw = tiled ? v(322) : w, th = tiled ? v(323) : v(278, h);
  const offsets = (tags.get(tiled ? 324 : 273)!).values, counts = (tags.get(tiled ? 325 : 279)!).values;
  const bps = bits / 8;
  const data = new Float32Array(w * h);
  const across = Math.ceil(w / tw);
  for (let t = 0; t < offsets.length; t++) {
    const raw = buf.subarray(offsets[t], offsets[t] + counts[t]);
    const rows = tiled ? th : Math.min(th, h - t * th);
    const need = tw * rows * bps;
    let b: Buffer = comp === 1 ? Buffer.from(raw) : comp === 8 || comp === 32946 ? inflateSync(raw) : comp === 5 ? lzw(raw, need) : (() => { throw new Error(`compression ${comp} not supported`); })();
    if (pred === 3) {
      // floating-point predictor: per row, undo byte differencing, then regroup the byte planes
      const out = Buffer.alloc(b.length), rowBytes = tw * bps;
      for (let r = 0; r < rows; r++) {
        const o = r * rowBytes;
        for (let i = 1; i < rowBytes; i++) b[o + i] = (b[o + i] + b[o + i - 1]) & 255;
        for (let i = 0; i < tw; i++) for (let k = 0; k < bps; k++) out[o + i * bps + (le ? bps - 1 - k : k)] = b[o + k * tw + i];
      }
      b = out;
    }
    const x0 = tiled ? (t % across) * tw : 0, y0 = tiled ? Math.floor(t / across) * th : t * th;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r;
      if (y >= h) break;
      let acc = 0;
      for (let i = 0; i < tw; i++) {
        const x = x0 + i, o = (r * tw + i) * bps;
        let val: number;
        if (fmt === 3 && bps === 4) val = le ? b.readFloatLE(o) : b.readFloatBE(o);
        else if (bps === 2) val = fmt === 2 ? (le ? b.readInt16LE(o) : b.readInt16BE(o)) : le ? b.readUInt16LE(o) : b.readUInt16BE(o);
        else if (bps === 4) val = fmt === 2 ? (le ? b.readInt32LE(o) : b.readInt32BE(o)) : le ? b.readUInt32LE(o) : b.readUInt32BE(o);
        else throw new Error(`sample size ${bits} not supported`);
        if (pred === 2) { acc = i === 0 ? val : acc + val; if (bps === 2 && fmt === 2) acc = ((acc + 32768) & 65535) - 32768; val = acc; }
        if (x < w) data[y * w + x] = val;
      }
    }
  }
  const scale = tags.get(33550)!.values, tie = tags.get(33922)!.values;
  const nd = tags.get(42113)?.text;
  return { w, h, geo: [tie[3] - tie[0] * scale[0], tie[4] + tie[1] * scale[1], scale[0], scale[1]], nodata: nd ? Number(nd) : null, data };
}
