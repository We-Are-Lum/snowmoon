'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { VIEWS, aspect, edgeText, fit, layout, suggestUrl, tierFor, type SimpleView, type ViewKey } from '~/lib/maps/simple';

/**
 * The simple map (Claude Design's "SimpleMap v2", 2026-10-15): the whole layout on Design's tracing of the
 * frozen v5 terrain, every city on it, read-only. Desktop: Design's D1. Phone: P1 (the whole layout), P2
 * (Veridia and Northshore) and P3 (the United Cities), as tabs. Tap a place for its sheet. Only the terrain
 * grid is drawn; Glasscrown and Dzego, which lie off it, are edge labels.
 *
 * Owner, 2026-10-15: the map is ours, so there is no book-vs-ours key; one ⓘ "About this map" says it is
 * invented, not by the author, and subject to change, and links the recipe. Nothing is hidden by chapter.
 * Wording: drafted by Claude Design and the coding agent (closed models), not yet approved.
 */
type Data = SimpleView & { label: string; shortLabel: string; repo: string; links: { recipe: string; drawing: string; issue: string } };
type Sel = { id: string; name: string; note: string };

export function SimpleMap({ data }: { data: Data }) {
  const [view, setView] = useState<ViewKey>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [w, setW] = useState(0);
  const [about, setAbout] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const phone = w > 0 && w < 700;
  const h = Math.round(w * aspect(view));
  const fs = 12, dot = phone ? 10 : 11;
  const T = useMemo(() => fit(VIEWS[view].box, w || 1, h || 1, data.grid.w, data.grid.h), [view, w, h, data.grid]);

  // area names (countries, regions): centred, kept clear of each other, the dots and the chips
  const areas = useMemo(() => {
    if (!w) return [];
    type B = [number, number, number, number];
    const over = (a: B, b: B) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    // Design's rule: an area's name moves up or down off any city dot, or is left out
    const dots: B[] = data.places.filter((p) => p.kind === 'city').map((p) => { const [x, y] = T.P(p.at); return [x - 9, y - 9, x + 9, y + 9]; });
    const taken: B[] = [];
    return data.places.filter((p) => p.kind === 'area' && p.tier <= (phone && view === 'all' ? 1 : 2)).flatMap((p) => {
      const [x0, y0] = T.P(p.at), big = p.tier === 1, afs = big ? (phone ? 13 : 16) : 12;
      const hw = (p.name.length * afs * (big ? 0.85 : 0.75)) / 2 + 4, x = Math.max(hw + 4, Math.min(w - hw - 4, x0));
      for (const dy of [0, -1.4, 1.4, -2.8, 2.8].map((m) => m * afs)) {
        const y = y0 + dy, b: B = [x - hw, y - afs * 0.8, x + hw, y + afs * 0.8];
        if (b[1] < (phone ? 4 : 30) || b[3] > h - (phone ? 4 : 40)) continue; // desktop: clear of the chips at the top and bottom
        if (dots.some((d) => over(d, b)) || taken.some((q) => over(q, b))) continue;
        taken.push(b);
        return [{ p, x, y, afs, big, b }];
      }
      return [];
    });
  }, [data.places, T, w, h, phone, view]);
  const glX = (e: (typeof data.edges)[number]) => Math.max(110, Math.min(w - 120, T.P([e.at, 0])[0]));
  // the ⓘ chip (bottom left) and, on desktop, the edge labels (top right) are kept clear of labels
  const chips: [number, number, number, number][] = phone ? [] : [[0, h - 40, 236, h], ...data.edges.map((e): [number, number, number, number] => (e.side === 'top' ? [glX(e) - 150, 0, glX(e) + 150, 36] : [w - 330, 34, w, 72]))];
  const marks = useMemo(() => (w ? layout(data.places, T, w, h, { fs, dot, tier: tierFor(view, phone), sel, name: (p) => p.name, taken: [...areas.map((a) => a.b), ...chips] }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.places, T, w, h, dot, view, phone, sel, areas]);

  const byId = (id: string): Sel | null => data.places.find((p) => p.id === id) ?? data.edges.find((e) => e.id === id) ?? null;
  const cur = sel ? byId(sel) : null;
  const pick = (id: string) => { setAbout(false); setSel((s) => (s === id ? null : id)); };
  const toggleAbout = () => { setSel(null); setAbout((a) => !a); };

  return (
    <div className="sm">
      <header className="sm-head">
        <p className="label">Maps · draft</p>
        <div className="sm-title-row">
          <h1 className="sm-title">Where things are</h1>
          <button type="button" className="sm-info" onClick={toggleAbout} aria-expanded={about} aria-controls="sm-about">
            ⓘ <span>About this map</span>
          </button>
        </div>
        <p className="sm-intro">One possible layout of the book’s world: coastlines, seas, lakes, forests and high ground traced from our terrain and simplified, with every city on it. Tap a place.</p>
        {about && <About data={data} onClose={() => setAbout(false)} />}
      </header>

      <div className="sm-tabs" role="tablist" aria-label="Views">
        {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={`sm-tab${view === k ? ' is-on' : ''}`} onClick={() => setView(k)}>
            {VIEWS[k].tab}
          </button>
        ))}
      </div>

      <div className="sm-frame">
        {phone && (
          <div className="sm-edges">
            {data.edges.map((e) => (
              <button key={e.id} type="button" className="sm-edge" onClick={() => pick(e.id)}>
                {edgeText(e)}
              </button>
            ))}
            <button type="button" className="sm-edge sm-ai-strip" onClick={toggleAbout} aria-expanded={about} aria-controls="sm-about">
              {data.shortLabel} ⓘ
            </button>
          </div>
        )}
        <div ref={box} className="sm-map" style={{ height: h || undefined }} role="group" aria-label={`${VIEWS[view].title}. ${data.shortLabel}. Invented by Snowmoon Party, not by the author.`}>
          {w > 0 && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sm-base" src={data.image} alt="" style={{ left: T.ox, top: T.oy, width: data.grid.w * T.s, height: data.grid.h * T.s }} />
              {areas.map(({ p, x, y, afs, big }) => (
                <button key={p.id} type="button" className={`sm-area${big ? ' is-big' : ''}`} style={{ left: x, top: y, fontSize: afs }} onClick={() => pick(p.id)}>
                  {p.name}
                </button>
              ))}
              {marks.map((m) => {
                const p = data.places.find((q) => q.id === m.id)!, on = sel === p.id;
                const isl = p.id === 'redshire_islands';
                const r = isl ? 22 * T.s + 6 : dot;
                return (
                  <span key={p.id}>
                    <button
                      type="button"
                      aria-label={p.name}
                      className={`sm-dot${isl ? ' is-islands' : ''}${on ? ' is-on' : ''}`}
                      style={{ left: isl ? m.x + 2 * T.s : m.x, top: isl ? m.y + 14 * T.s : m.y, width: isl ? 2 * r : r, height: isl ? 2 * r : r }}
                      onClick={() => pick(p.id)}
                    />
                    {m.label && (
                      <button type="button" tabIndex={-1} aria-hidden="true" className={`sm-label sm-${m.label.align}${on ? ' is-on' : ''}`} style={{ left: m.label.x, top: m.label.y }} onClick={() => pick(p.id)}>
                        {m.label.text}
                      </button>
                    )}
                  </span>
                );
              })}
              {!phone && data.edges.map((e) => (
                <button key={e.id} type="button" className={`sm-edge sm-edge-${e.side}`} style={e.side === 'top' ? { left: glX(e) } : { top: 40 }} onClick={() => pick(e.id)}>
                  {edgeText(e)}
                </button>
              ))}
              {!phone && (
                <button type="button" className="sm-ai" onClick={toggleAbout} aria-expanded={about} aria-controls="sm-about">
                  {data.shortLabel} ⓘ
                </button>
              )}
            </>
          )}
        </div>
        <div className="sm-sheet" aria-live="polite">
          {!cur && <p className="sm-note">Tap a place. Everything on this map is our invention, made to fit what the book says.</p>}
          {cur && (
            <div className="sm-place">
              <div className="sm-row">
                <span className="sm-name">{titleCase(cur.name)}</span>
                <button type="button" className="sm-x" onClick={() => setSel(null)} aria-label="Close">✕</button>
              </div>
              {cur.note && <p className="sm-note">{cur.note}</p>}
              <a className="sm-suggest" href={suggestUrl(data.repo, { id: cur.id, name: titleCase(cur.name) })} target="_blank" rel="noopener noreferrer">
                Suggest a change ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** What this map is: invented, not by the author, subject to change, and how it was made. */
function About({ data, onClose }: { data: Data; onClose: () => void }) {
  return (
    <div id="sm-about" className="sm-about" role="region" aria-label="About this map">
      <p>
        <strong>Invented by Snowmoon Party, not by the author.</strong> The book has no map of its world. It has two small figures, the battle map in chapter 29 and the
        diagram of how the United Cities connect in chapter 5, and some lines about where things are. We drew everything else (the coasts, where countries and cities sit,
        the borders) so that it fits those.
      </p>
      <p>{data.label}</p>
      <p>It will change as we and readers work on the book’s world. If something looks wrong, tap the place and suggest a change.</p>
      <p className="sm-about-links">
        <a href={data.links.recipe} target="_blank" rel="noopener noreferrer">The terrain’s recipe ↗</a>
        <a href={data.links.drawing} target="_blank" rel="noopener noreferrer">How this drawing was made ↗</a>
        <a href={data.links.issue} target="_blank" rel="noopener noreferrer">Suggest a change ↗</a>
        <button type="button" className="sm-link" onClick={onClose}>Close</button>
      </p>
    </div>
  );
}

/** Area names are stored in capitals for the map; the sheet shows them as names. */
function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}
