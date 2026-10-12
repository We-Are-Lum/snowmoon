/**
 * Seeded randomness and gradient noise for the terrain generator (scripts/terrain.ts).
 * Deterministic: the same seed gives the same numbers on any machine.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Improved Perlin noise in 2D, about -1..1. */
export class Noise2 {
  private p: Uint8Array;
  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  private static fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  private static grad(h: number, x: number, y: number) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  at(x: number, y: number): number {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = Noise2.fade(xf), v = Noise2.fade(yf);
    const p = this.p;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = Noise2.grad(aa, xf, yf) + u * (Noise2.grad(ba, xf - 1, yf) - Noise2.grad(aa, xf, yf));
    const x2 = Noise2.grad(ab, xf, yf - 1) + u * (Noise2.grad(bb, xf - 1, yf - 1) - Noise2.grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.7071;
  }
  /** Layered noise (fractional Brownian motion), about -1..1. */
  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.at(x * freq + o * 17.31, y * freq - o * 9.17);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
  /** Ridged layered noise, 0..1, peaked along lines: mountain ranges. */
  ridged(x: number, y: number, octaves: number): number {
    let sum = 0, amp = 0.5, freq = 1, weight = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.at(x * freq + o * 31.7, y * freq + o * 5.3));
      n *= n * weight;
      weight = Math.min(1, Math.max(0, n * 2));
      sum += n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
