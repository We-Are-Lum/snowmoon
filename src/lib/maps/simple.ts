/**
 * The simple map's logic (src/components/simple-map.tsx; Claude Design's SimpleMap v2), kept apart from
 * React so scripts/test-maps-simple.ts can run it: the views, the fit, the label layout and the
 * "Suggest a change" link.
 */
export type Pt = [number, number];
export type SimplePlace = { id: string; name: string; kind: 'city' | 'area'; prov: 'book' | 'placed'; at: Pt; note: string; tier: number };
export type SimpleEdge = { id: string; name: string; text: string; side: 'top' | 'right'; at: number; prov: 'placed'; note: string };
export type SimpleView = { grid: { w: number; h: number; km_per_px: number }; image: string; places: SimplePlace[]; edges: SimpleEdge[] };

export type ViewKey = 'all' | 'west' | 'uc';
/** Region-pixel boxes [x0, y0, x1, y1] (Design: VIEWS.all, west, uc). */
export const VIEWS: Record<ViewKey, { box: [number, number, number, number]; tab: string; title: string }> = {
  all: { box: [0, 0, 2048, 1061], tab: 'Whole layout', title: 'The whole layout, every city' },
  west: { box: [0, 120, 1100, 1040], tab: 'Veridia and Northshore', title: 'Veridia and Northshore' },
  // Design's P3 box began at x 1240, cutting off Hapton and Silverbeach; widened so every United Cities city shows
  uc: { box: [1060, 180, 2048, 1061], tab: 'United Cities', title: 'The United Cities' },
};
/**
 * The map's height for its width: each view's own box, so the whole box shows on any screen and every city in it
 * is on the map (Design's frames, D1 1100 × 640, P1 390 × 340, P2 and P3 390 × 420, cropped the edges).
 */
export const aspect = (v: ViewKey) => { const [x0, y0, x1, y1] = VIEWS[v].box; return (y1 - y0) / (x1 - x0); };
/** Which labels show (Design's tiers): every city on the desktop and the phone's United Cities, fewer on small views. */
export const tierFor = (v: ViewKey, phone: boolean) => (!phone ? 3 : v === 'all' ? 1 : v === 'west' ? 2 : 3);

/** Scale and offset that cover the box, never showing past the grid's edge (Design's fit, cover mode). */
export function fit(box: [number, number, number, number], w: number, h: number, gw: number, gh: number) {
  const [x0, y0, x1, y1] = box, cw = x1 - x0, ch = y1 - y0;
  const s = Math.max(w / cw, h / ch, w / gw, h / gh);
  const ox = Math.min(0, Math.max(w - gw * s, -(x0 + cw / 2) * s + w / 2));
  const oy = Math.min(0, Math.max(h - gh * s, -(y0 + ch / 2) * s + h / 2));
  return { s, ox, oy, P: ([x, y]: Pt): Pt => [ox + x * s, oy + y * s] };
}

/** An edge label: an arrow pointing off the map, then the place. */
export const edgeText = (e: SimpleEdge) => `${e.side === 'top' ? '↑' : '→'} ${e.text}`;

/** A new GitHub issue with the place filled in. Nothing is sent from the site; GitHub opens. */
export function suggestUrl(repo: string, p: { id: string; name: string }) {
  const title = `Map: ${p.name}`;
  const body = `Place: ${p.name} [${p.id}]\nMap: /maps (the simple map)\n\nWhat should change, and why? A chapter and block from the book helps.\n`;
  return `${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=map`;
}

export type Mark = { id: string; x: number; y: number; label: { x: number; y: number; align: 'left' | 'right' | 'center'; text: string } | null };
type Box = [number, number, number, number];
const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Where each city's dot and label go (Design's marks(), simplified): the selected one first, then by tier;
 * a label goes right of its dot, else left, else above or below, else is left out (the dot stays tappable).
 * A label keeps clear of other labels, every other dot (a tier-1 name only when it can), and the boxes in `taken`.
 * `fs` is the label size in px; text width is estimated at 0.62 em per character (DM Mono).
 */
export function layout(places: SimplePlace[], T: ReturnType<typeof fit>, w: number, h: number, o: { fs: number; dot: number; tier: number; sel: string | null; name: (p: SimplePlace) => string; taken?: Box[] }): Mark[] {
  const boxes: Box[] = [...(o.taken ?? [])];
  const pts = places.filter((p) => p.kind === 'city').map((p) => ({ p, xy: T.P(p.at) })).filter(({ xy }) => xy[0] >= 0 && xy[1] >= 0 && xy[0] <= w && xy[1] <= h); // Petersvil sits on the grid's east edge
  pts.sort((a, b) => Number(b.p.id === o.sel) - Number(a.p.id === o.sel) || a.p.tier - b.p.tier);
  const dotBoxes = pts.map(({ p, xy }) => ({ id: p.id, b: [xy[0] - o.dot / 2 - 2, xy[1] - o.dot / 2 - 2, xy[0] + o.dot / 2 + 2, xy[1] + o.dot / 2 + 2] as Box }));
  return pts.map(({ p, xy }) => {
    const on = p.id === o.sel, text = o.name(p), r = o.dot / 2;
    const mark: Mark = { id: p.id, x: xy[0], y: xy[1], label: null };
    if (!on && p.tier > o.tier) return mark;
    const tw = text.length * o.fs * 0.62 + 6, hh = o.fs * 0.75;
    const tries: [Box, Mark['label']][] = [
      [[xy[0] + r + 4, xy[1] - hh, xy[0] + r + 4 + tw, xy[1] + hh], { x: xy[0] + r + 4, y: xy[1], align: 'left', text }],
      [[xy[0] - r - 4 - tw, xy[1] - hh, xy[0] - r - 4, xy[1] + hh], { x: xy[0] - r - 4, y: xy[1], align: 'right', text }],
      ...[-1, 1].map((m): [Box, Mark['label']] => {
        const cy = xy[1] + m * (r + o.fs * 0.95), cx = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, xy[0]));
        return [[cx - tw / 2, cy - hh, cx + tw / 2, cy + hh], { x: cx, y: cy, align: 'center', text }];
      }),
    ];
    const ok = (b: Box, dots: boolean) => b[0] > 2 && b[2] < w - 2 && b[1] > 2 && b[3] < h - 2 && (on || !boxes.some((q) => hit(q, b))) && (!dots || !dotBoxes.some((d) => d.id !== p.id && hit(d.b, b)));
    // the main names (tier 1) may run over another dot when nothing else fits; the dot stays tappable
    const pick = tries.find(([b]) => ok(b, true)) ?? (p.tier === 1 || on ? tries.find(([b]) => ok(b, false)) : undefined);
    if (pick) { boxes.push(pick[0]); mark.label = pick[1]; }
    return mark;
  });
}
