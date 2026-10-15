'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { openedChapters } from '~/lib/chat/device';
import { VIEWS, aspect, edgeText, fit, layout, shownName, status, suggestUrl, tierFor, type SimplePlace, type SimpleView, type ViewKey } from '~/lib/maps/simple';

/**
 * The simple map (Claude Design's "SimpleMap v2", 2026-10-15): the whole layout on Design's tracing of the
 * frozen v5 terrain, every city on it, read-only. Desktop: Design's D1. Phone: P1 (the whole layout), P2
 * (Veridia and Northshore) and P3 (the United Cities), as tabs. Tap a place for its sheet. Only the terrain
 * grid is drawn; Glasscrown and Dzego, which lie off it, are edge labels.
 *
 * Book vs placed by us: a filled square and an upright name, or a hollow ring and an italic name.
 * Spoilers as the glossary and the terrain map do it: the furthest chapter opened on this device.
 * Wording: drafted by Claude Design and the coding agent (closed models), not yet approved.
 */
type Data = SimpleView & { label: string; shortLabel: string; repo: string };
type Sel = { id: string; name: string; prov: 'book' | 'placed'; note: string; first: number };

export function SimpleMap({ data }: { data: Data }) {
  const [view, setView] = useState<ViewKey>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [limit, setLimit] = useState(1);
  const [reveal, setReveal] = useState<string[]>([]);
  const [w, setW] = useState(0);
  const [about, setAbout] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLimit(Math.max(1, ...openedChapters()));
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
  const st = (p: { id: string; first: number }) => status(p.first, limit, reveal.includes(p.id));
  const name = (p: SimplePlace) => shownName(p, limit, reveal.includes(p.id));

  // area names (countries, regions): centred, kept clear of each other and the edge labels
  const areas = useMemo(() => {
    if (!w) return [];
    type B = [number, number, number, number];
    const over = (a: B, b: B) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    // Design's rule: an area's name moves up or down off any city dot, or is left out
    const dots: B[] = data.places.filter((p) => p.kind === 'city').map((p) => { const [x, y] = T.P(p.at); return [x - 9, y - 9, x + 9, y + 9]; });
    const taken: B[] = [];
    return data.places.filter((p) => p.kind === 'area' && p.tier <= (phone && view === 'all' ? 1 : 2) && st(p) !== 'hidden').flatMap((p) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.places, T, w, h, phone, view, limit, reveal]);
  const glX = (e: (typeof data.edges)[number]) => Math.max(110, Math.min(w - 120, T.P([e.at, 0])[0]));
  // the "AI map" chip (bottom left) and, on desktop, the edge labels (top right) are kept clear of labels
  const chips: [number, number, number, number][] = phone ? [] : [[0, h - 40, 236, h], ...(data.edges.map((e): [number, number, number, number] => (e.side === 'top' ? [glX(e) - 150, 0, glX(e) + 150, 36] : [w - 330, 34, w, 72])))];
  const marks = useMemo(() => (w ? layout(data.places, T, w, h, { fs, dot, tier: tierFor(view, phone), sel, name, taken: [...areas.map((a) => a.b), ...chips] }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.places, T, w, h, dot, view, phone, sel, limit, reveal, areas]);

  const byId = (id: string): Sel | null => data.places.find((p) => p.id === id) ?? data.edges.find((e) => e.id === id) ?? null;
  const cur = sel ? byId(sel) : null;
  const curSt = cur ? st(cur) : null;
  const pick = (id: string) => setSel((s) => (s === id ? null : id));

  return (
    <div className="sm">
      <header className="sm-head">
        <p className="label">Maps · simple map · draft</p>
        <h1 className="sm-title">Where things are</h1>
        <p className="sm-intro">The real coastlines, seas, lakes, forests and high ground, traced from the frozen terrain and then simplified. Countries are tinted bands inside their borders, and cities sit where the layout puts them. One possible layout: the book fixes some of it, we chose the rest.</p>
        <ul className="sm-key" aria-label="Key">
          <li><span className="sm-k-book" aria-hidden="true" />from the book: filled square, upright name</li>
          <li className="is-ours"><span className="sm-k-ours" aria-hidden="true" />placed by us: hollow ring, italic name</li>
          <li><span className="sm-k-border" aria-hidden="true" />border placed by us</li>
        </ul>
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
                {edgeText(e, limit, reveal.includes(e.id))}
              </button>
            ))}
            <button type="button" className="sm-edge sm-ai-strip" onClick={() => setAbout((a) => !a)} aria-expanded={about}>
              {data.shortLabel} ⓘ
            </button>
          </div>
        )}
        <div ref={box} className="sm-map" style={{ height: h || undefined }} role="group" aria-label={`${VIEWS[view].title}. ${data.shortLabel}.`}>
          {w > 0 && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sm-base" src={data.image} alt="" style={{ left: T.ox, top: T.oy, width: data.grid.w * T.s, height: data.grid.h * T.s }} />
              {areas.map(({ p, x, y, afs, big }) => (
                <button key={p.id} type="button" className={`sm-area${big ? ' is-big' : ''}${p.prov === 'placed' ? ' is-ours' : ''}`} style={{ left: x, top: y, fontSize: afs }} onClick={() => pick(p.id)}>
                  {p.name}
                </button>
              ))}
              {marks.map((m) => {
                const p = data.places.find((q) => q.id === m.id)!, s = st(p), book = p.prov === 'book', on = sel === p.id;
                const isl = p.id === 'redshire_islands';
                const r = isl ? 22 * T.s + 6 : dot;
                return (
                  <span key={p.id}>
                    <button
                      type="button"
                      aria-label={s === 'hidden' ? 'A place from a later chapter' : p.name}
                      className={`sm-dot${isl ? ' is-islands' : book ? ' is-book' : ' is-ours'}${on ? ' is-on' : ''}${s === 'hidden' ? ' is-later' : ''}`}
                      style={{ left: isl ? m.x + 2 * T.s : m.x, top: isl ? m.y + 14 * T.s : m.y, width: isl ? 2 * r : r, height: isl ? 2 * r : r }}
                      onClick={() => pick(p.id)}
                    />
                    {m.label && (
                      <button type="button" tabIndex={-1} aria-hidden="true" className={`sm-label sm-${m.label.align}${book ? '' : ' is-ours'}${on ? ' is-on' : ''}`} style={{ left: m.label.x, top: m.label.y }} onClick={() => pick(p.id)}>
                        {m.label.text}
                      </button>
                    )}
                  </span>
                );
              })}
              {!phone && data.edges.map((e) => (
                <button key={e.id} type="button" className={`sm-edge sm-edge-${e.side}`} style={e.side === 'top' ? { left: glX(e) } : { top: 40 }} onClick={() => pick(e.id)}>
                  {edgeText(e, limit, reveal.includes(e.id))}
                </button>
              ))}
              {!phone && <button type="button" className="sm-ai" onClick={() => setAbout((a) => !a)} aria-expanded={about}>
                {data.shortLabel} ⓘ
              </button>}
            </>
          )}
        </div>
        <div className="sm-sheet" aria-live="polite">
          {about && !cur && (
            <p className="sm-note">
              {data.label} <button type="button" className="sm-link" onClick={() => setAbout(false)}>Close</button>
            </p>
          )}
          {!cur && !about && <p className="sm-note">Tap a place. The coast, seas and high ground follow the terrain. The countries’ borders are ours.</p>}
          {cur && curSt === 'hidden' && (
            <div className="sm-cover">
              <div className="sm-row">
                <span className="sm-name">A place from after chapter {limit}</span>
                <button type="button" className="sm-x" onClick={() => setSel(null)} aria-label="Close">✕</button>
              </div>
              <p className="sm-note">What the book says about it comes from a chapter you haven’t read yet.</p>
              <div className="sm-row">
                <button type="button" className="sm-btn is-ink" onClick={() => setSel(null)}>Keep hidden</button>
                <button type="button" className="sm-btn" onClick={() => setReveal((r) => [...r, cur.id])}>Show anyway</button>
              </div>
            </div>
          )}
          {cur && curSt !== 'hidden' && (
            <div className="sm-place">
              <div className="sm-row">
                <span className={`sm-name${cur.prov === 'book' ? '' : ' is-ours'}`}>{titleCase(cur.name)}</span>
                <span className={`sm-tag${cur.prov === 'book' ? ' is-book' : ''}`}>{cur.prov === 'book' ? 'From the book' : 'Placed by us'}</span>
                <button type="button" className="sm-x" onClick={() => setSel(null)} aria-label="Close">✕</button>
              </div>
              {curSt === 'revealed' && (
                <button type="button" className="sm-link sm-past" onClick={() => setReveal((r) => r.filter((x) => x !== cur.id))}>
                  Past your chapter · shown anyway · Hide again
                </button>
              )}
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

/** Area names are stored in capitals for the map; the sheet shows them as names. */
function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}
