/**
 * The random selection on /challenge (owner, 2026-11-04: a narrow P5g exception): a fresh, unweighted shuffle on each
 * visit, drawn from all published remixes of the challenge's characters. No weighting, no counts, no featuring.
 *
 * A Fisher–Yates shuffle over a generic list: it can't read anything about an item (T is unconstrained), so nothing
 * but chance decides the order. Each draw is a uniform whole number below n, from the browser's crypto when there is
 * one. check:principles P5g allows randomness in the challenge's code here and
 * nowhere else, and scripts/test-challenge.ts proves the result is uniform, with a planted weighted shuffle that fails.
 */

/** A uniform number in [0, 1). The browser's crypto when it has one; Math.random otherwise. */
export function uniform(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  return Math.random();
}

/** A uniform whole number from 0 to n - 1. */
function below(n: number, random: () => number): number {
  return Math.min(n - 1, Math.floor(random() * n));
}

/** A new list holding every item once, in a uniformly random order. The input is not changed. */
export function shuffleFresh<T>(items: readonly T[], random: () => number = uniform): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(i + 1, random);
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}
