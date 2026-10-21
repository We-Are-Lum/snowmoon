import type { Slide } from './player';

/** The editor data a storyboard needs (public/editor/<id>/v<n>/data.json, made from committed files). */
export interface BoardData {
  adaptation: number;
  version: number;
  title: string;
  shots: {
    id: string;
    n: number;
    from: number;
    to: number;
    frame: string | null;
    made: string | null;
    action: string | null;
    lines: {
      cue: string;
      at: number;
      speaker: string | null;
      text: string | null;
      voice: { src: string; name: string | null } | null;
      takes?: { id: string; voice: string; inVersion?: boolean; src: string }[];
    }[];
  }[];
}
export interface BoardItem {
  key?: string;
  shot: string;
  frame: string | null;
  seconds: number;
}

export function buildSlides(d: BoardData, items: BoardItem[], takes: Record<string, string>, frames: Record<string, { url: string; hidden: boolean }>, by: string): Slide[] {
  return items.map((it, k) => {
    const s = d.shots.find((x) => x.id === it.shot);
    const remix = it.frame ? frames[it.frame] : null;
    const lines = (s?.lines ?? [])
      .map((l) => {
        const take = takes[l.cue] ?? 'version';
        const alt = take === 'version' ? null : l.takes?.find((t) => t.id === take);
        const src = alt?.src ?? l.voice?.src;
        return src ? { cue: l.cue, offset: +(l.at - (s?.from ?? 0)).toFixed(2), src, label: `${l.speaker ?? 'Line'} ${l.cue} (${alt ? alt.voice : 'as in the version'})` } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    const allVersion = (s?.lines ?? []).every((l) => (takes[l.cue] ?? 'version') === 'version');
    return {
      key: it.key ?? `${k}`,
      src: remix ? (remix.hidden ? null : remix.url) : (s?.frame ?? null),
      alt: remix ? (remix.hidden ? 'This remix frame was hidden' : `Shot ${s?.n}, remixed by ${by}`) : s ? `Shot ${s.n}: ${s.action ?? s.made ?? 'the version’s frame'}` : 'A shot this version no longer has',
      caption: `Shot ${s?.n ?? '?'} · ${remix ? `remix by ${by}` : `version ${d.version}`}`,
      seconds: it.seconds,
      from: s?.from ?? 0,
      lines,
      mix: allVersion,
    };
  });
}
