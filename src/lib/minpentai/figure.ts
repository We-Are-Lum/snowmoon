/**
 * Reads the frames of figure c4-b5 (docs/source-figures/c4-b5.svg): a 24 × 16 cell
 * animation, 120 frames labelled t=0…119. Each live cell is a path inside the
 * 16× scaled group, with a discrete opacity schedule over a 12-second loop.
 * Paths that carry their own fill are not cells: the grid-line pattern and the gold
 * outline over columns 10–13. Pure: takes the SVG text, returns frames.
 */
export const FIGURE_W = 24;
export const FIGURE_H = 16;

export interface Frame {
  /** Live cells as "x,y". */
  live: Set<string>;
}

export function parseFigureFrames(svg: string): Frame[] {
  const pathRe = /<path d="([^"]+)"(?![^>]*fill=)[^>]*>(?:<animate attributeName="opacity" values="([^"]+)" keyTimes="([^"]+)")?/g;
  const cells: { pts: [number, number][]; sched: [number, number][] }[] = [];
  const times = new Set<number>();
  for (const m of svg.matchAll(pathRe)) {
    const pts = [...m[1].matchAll(/M(\d+) (\d+)/g)].map((p) => [Number(p[1]), Number(p[2])] as [number, number]);
    let sched: [number, number][] = [[0, 1]];
    if (m[2] && m[3]) {
      const vals = m[2].split(';').map(Number);
      const keys = m[3].split(';').map(Number);
      sched = keys.map((k, i) => [k, vals[i]]);
      keys.forEach((k) => times.add(k));
    }
    cells.push({ pts, sched });
  }
  // The counter digits change on key times too; include them so no frame is missed.
  for (const m of svg.matchAll(/<animate attributeName="x" values="[^"]+" keyTimes="([^"]+)"/g)) {
    m[1].split(';').map(Number).forEach((k) => times.add(k));
  }
  const sorted = [...times].sort((a, b) => a - b);
  const at = (sched: [number, number][], t: number) => {
    let v = sched[0][1];
    for (const [k, val] of sched) if (k <= t + 1e-9) v = val;
    return v;
  };
  return sorted.map((t) => {
    const live = new Set<string>();
    for (const c of cells) if (at(c.sched, t) > 0.5) for (const [x, y] of c.pts) live.add(`${x},${y}`);
    return { live };
  });
}

/** The opening frame as rows of "#" and ".", for presets. */
export function frameRows(frame: Frame): string[] {
  return Array.from({ length: FIGURE_H }, (_, y) =>
    Array.from({ length: FIGURE_W }, (_, x) => (frame.live.has(`${x},${y}`) ? '#' : '.')).join(''),
  );
}
