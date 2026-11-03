/**
 * Where your own gliders left your sight during a run (owner, 2026-10-31): one-on-one shows only what is in sight,
 * your own gliders too, so a glider that flies out of sight would simply vanish. Instead its last square seen keeps a
 * faded marker, pointing the way it was heading, for the rest of that run, like the dimmed last-seen towers.
 *
 * Built only from the frames the side was sent (already fogged): it shows nothing the side didn't see.
 */
import type { Engine, Side, World } from '../versions/engine';

/** For each frame i, the markers so far: square → the direction the glider was heading when last seen there. */
export function leftSight(frames: World[], side: Side, R: number, e: Engine): Map<number, [number, number]>[] {
  const out: Map<number, [number, number]>[] = [];
  let marks = new Map<number, [number, number]>();
  frames.forEach((f, i) => {
    if (i > 0) {
      const prev = frames[i - 1], see = e.lit(f, side, R);
      marks = new Map(marks);
      for (const g of prev.gl) {
        if (g.o !== side) continue;
        const tx = g.x + g.dx, ty = g.y + g.dy;
        // Its next square is on the board and out of sight now: it flew out of sight from where it was.
        if (e.inb(tx, ty) && !see.has(e.K(tx, ty))) marks.set(e.K(g.x, g.y), [g.dx, g.dy]);
      }
    }
    out.push(marks);
  });
  return out;
}
