'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openedChapters } from '~/lib/chat/device';

/**
 * The world map (Claude Design's "World Map Styled", 2026-10-12): the frozen v5 terrain, styled and baked by
 * scripts/maps-style.ts, with the book's places drawn on top. Four views (the world; Northshore on the book's
 * battle map; the United Cities; Dzego's inset). Labels appear as you zoom; every place stays tappable.
 *
 * Book vs placed by us (docs/maps/design-handoff.md): book places get a filled square and an upright label,
 * ours a hollow ring and an italic label; book areas are spaced caps, ours italic caps between dots; an
 * outline shows on tap, solid for the book, dashed for ours.
 *
 * Spoilers, as the glossary does it: the furthest chapter opened on this device (at least 1). A place first
 * mentioned later shows as a "?" with no name; its sheet offers "Show anyway". Sheets list only the world
 * guide lines up to that chapter.
 * Wording: drafted by the coding agent (a closed model) and Claude Design, not yet approved.
 */

type Pt = [number, number];
type ViewKey = 'world' | 'ns' | 'uc' | 'dz';
type ViewData = { image: string; small?: string; w: number; h: number; km_per_px: number; crop?: number[] };
type Place = {
  id: string; name: string; shape: 'point' | 'polygon' | 'polyline' | 'circle'; provenance: 'book' | 'placed'; lines: string[]; hide_label: boolean;
  world: Pt[] | null; ns: Pt[] | null; dz: Pt[] | null; r_km?: number; anchor?: Partial<Record<ViewKey, Pt>>; first: number;
};
export type WorldMapData = {
  views: Record<ViewKey, ViewData>;
  places: Place[];
  sheets: Record<string, { prov: string; lines: { id: string; text: string; refs: string; ch: number }[] }>;
  placedWhy: Record<string, string>;
  label: string;
  shortLabel: string;
  textureNote: string;
  links: { errata: string; placed: string; recipe: string; issues: string; email: string };
};

const VIEWS: { k: ViewKey; t: string; title: string; note?: string }[] = [
  { k: 'world', t: 'World', title: 'The world of Snowmoon: one possible layout' },
  { k: 'ns', t: 'Northshore', title: 'Northshore and Thaldur, on the book’s battle map' },
  { k: 'uc', t: 'United Cities', title: 'The United Cities: the book’s links, our positions (one possible layout)' },
  { k: 'dz', t: 'Dzego', title: 'Dzego (inset)', note: '(draft) The book doesn’t say where Dzego lies relative to the United Cities.' },
];
// which labels show at first view; more appear at 1.8× and 3× (Design's tiers)
const TIER: Record<string, number> = { veridia: 1, uc_continent: 1, meldan: 1, redshire: 1, northshore: 1, thaldur: 1, dzego: 1, pafogai: 1, northglade: 2, north_sea: 2, elenar_forest: 2, arturia: 2, south_sea: 2, peninsula: 3, glasscrown: 2, sadzu: 2, arctic_west: 3, telten: 3, hapton: 3, silverbeach: 3, imber: 3, devanvil: 3, petersvil: 3, ondak: 3 };
const ROUTE = /_route$/;
const INK = '#1D1D1B', PAPER = '#F4F2ED';
const chapOf = (s: string) => Number(/^c(\d+)/.exec(s)?.[1] ?? 0);
const inPoly = (x: number, y: number, P: Pt[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const segD = (x: number, y: number, a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0; return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const nice = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };

type Frame = { v: number; zoom: number; c: Pt | null; sel: string | null; panel: 'about' | 'list' | null };

export function WorldMap({ data }: { data: WorldMapData }) {
  const [f, setF] = useState<Frame>({ v: 0, zoom: 1, c: null, sel: null, panel: null });
  const [limit, setLimit] = useState(1);
  const [reveal, setReveal] = useState<string[]>([]);
  const [desk, setDesk] = useState(false);
  const [scale, setScale] = useState({ t: '', w: 40 });
  const cv = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const pan = useRef<Pt>([0, 0]);
  const T = useRef<{ ox: number; oy: number; S: number; sx: number; sy: number; c0: Pt } | null>(null);
  const imgs = useRef<Record<string, HTMLImageElement>>({});
  const paintRef = useRef<() => void>(() => {});

  useEffect(() => {
    setLimit(Math.max(1, ...openedChapters()));
    // the side panel when the map's own box is wide enough (the rail and the assistant may share the window);
    // the map fills the screen below whatever sits above it
    const el = root.current;
    if (!el) return;
    const fit = () => { setDesk(el.clientWidth >= 1000); el.style.height = `${Math.max(360, window.innerHeight - el.getBoundingClientRect().top - window.scrollY)}px`; };
    const ro = new ResizeObserver(fit);
    ro.observe(el); ro.observe(document.body); window.addEventListener('resize', fit); fit();
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  // images: the small world first, then the full ones
  useEffect(() => {
    const want = [data.views.world.small, data.views.world.image, data.views.ns.image, data.views.dz.image].filter(Boolean) as string[];
    for (const src of want) { if (imgs.current[src]) continue; const i = new Image(); i.decoding = 'async'; i.onload = () => paintRef.current(); i.src = src; imgs.current[src] = i; }
  }, [data]);

  const V = VIEWS[f.v], key = V.k, vd = data.views[key];
  const coordsOf = useCallback((p: Place, k: ViewKey): Pt[] | null => {
    if (k === 'world') return p.world;
    if (k === 'ns') return p.ns;
    if (k === 'dz') return p.dz;
    const c = data.views.uc.crop!;
    return p.world ? p.world.map(([x, y]) => [x - c[0], y - c[1]] as Pt) : null;
  }, [data]);
  const anchorOf = useCallback((p: Place, k: ViewKey): Pt | null => {
    if (p.anchor?.[k]) return p.anchor[k]!;
    const P = coordsOf(p, k);
    if (!P || !P.length) return null;
    return p.shape === 'polyline' ? P[P.length - 1] : P[0];
  }, [coordsOf]);
  const status = useCallback((p: Place) => (reveal.includes(p.id) ? 'revealed' : p.first <= limit ? 'shown' : 'hidden'), [reveal, limit]);
  // the United Cities inset is about its cities: every city point shows at first view, areas from 1.8×
  const tierFor = (p: Place) => (key === 'world' ? TIER[p.id] ?? 3 : key === 'uc' ? (p.shape === 'point' ? 1 : 2) : 1);

  const paint = useCallback(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (!W || !H) return;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const [sx, sy, sw, sh] = vd.crop ? [vd.crop[0], vd.crop[1], vd.crop[2] - vd.crop[0], vd.crop[3] - vd.crop[1]] : [0, 0, vd.w, vd.h];
    const fit = desk && key === 'world' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
    const meldan = key === 'world' && !desk ? data.places.find((p) => p.id === 'meldan')?.world?.[0] : undefined;
    const S = fit * f.zoom, c0 = f.c ?? meldan ?? [sw / 2, sh / 2];
    let ox = W / 2 - c0[0] * S + pan.current[0] * dpr, oy = H / 2 - c0[1] * S + pan.current[1] * dpr;
    ox = sw * S <= W ? (W - sw * S) / 2 : Math.min(0, Math.max(W - sw * S, ox));
    oy = sh * S <= H ? (H - sh * S) / 2 : Math.min(0, Math.max(H - sh * S, oy));
    pan.current = [(ox - (W / 2 - c0[0] * S)) / dpr, (oy - (H / 2 - c0[1] * S)) / dpr];
    T.current = { ox, oy, S, sx, sy, c0: c0 as Pt };
    const ctx = canvas.getContext('2d')!;
    ctx.setLineDash([]);
    ctx.fillStyle = '#8AA2AA';
    ctx.fillRect(0, 0, W, H);
    // the full image once it has loaded and is needed; the small world image until then
    const full = imgs.current[vd.image], small = vd.small ? imgs.current[vd.small] : undefined;
    const img = full?.complete && full.naturalWidth && (S > 0.45 || !small?.naturalWidth) ? full : small?.complete && small.naturalWidth ? small : null;
    if (img) {
      const k = img.naturalWidth / vd.w;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx * k, sy * k, sw * k, sh * k, ox, oy, sw * S, sh * S);
    }
    const P = (x: number, y: number): Pt => [ox + x * S, oy + y * S];
    const km = vd.km_per_px;
    const vis = data.places.filter((p) => { const a = anchorOf(p, key); return a && a[0] > -sw * 0.2 && a[0] < sw * 1.2 && a[1] > -sh * 0.2 && a[1] < sh * 1.2; });
    const path = (p: Place) => {
      const Q = coordsOf(p, key)!;
      ctx.beginPath();
      if (p.shape === 'circle') { const [a, b] = P(...Q[0]); ctx.arc(a, b, ((p.r_km ?? 0) / km) * S, 0, 7); }
      else { Q.forEach((q, n) => { const [a, b] = P(q[0], q[1]); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); }); if (p.shape === 'polygon') ctx.closePath(); }
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // the battle groups' routes (book lines): on the Northshore view, and on the world from 2×
    const routeOn = key === 'ns' || (key === 'world' && f.zoom >= 2);
    for (const p of vis) {
      if (p.shape !== 'polyline' || status(p) === 'hidden') continue;
      const r = ROUTE.test(p.id), sel = p.id === f.sel;
      if (!(r && routeOn) && !sel) continue;
      path(p); ctx.strokeStyle = 'rgba(244,242,237,.85)'; ctx.lineWidth = (sel ? 6 : 4.5) * dpr; ctx.setLineDash(p.provenance === 'book' ? [] : [7 * dpr, 5 * dpr]); ctx.stroke();
      path(p); ctx.strokeStyle = r ? '#B23A2E' : '#2D5E86'; ctx.lineWidth = (sel ? 3.2 : 2.2) * dpr; ctx.stroke(); ctx.setLineDash([]);
      if (r) {
        const Q = coordsOf(p, key)!, a = P(...Q[Q.length - 2]), b = P(...Q[Q.length - 1]), an = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 9 * dpr;
        ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - L * Math.cos(an - 0.45), b[1] - L * Math.sin(an - 0.45)); ctx.lineTo(b[0] - L * Math.cos(an + 0.45), b[1] - L * Math.sin(an + 0.45)); ctx.closePath(); ctx.fillStyle = '#B23A2E'; ctx.fill();
      }
    }
    // the selected area's outline: solid for the book, dashed for ours
    const selP = f.sel ? vis.find((p) => p.id === f.sel) : undefined;
    if (selP && (selP.shape === 'polygon' || selP.shape === 'circle') && status(selP) !== 'hidden') {
      path(selP); ctx.fillStyle = 'rgba(244,242,237,.16)'; ctx.fill();
      ctx.setLineDash(selP.provenance === 'book' ? [] : [8 * dpr, 6 * dpr]); ctx.lineWidth = 4.5 * dpr; ctx.strokeStyle = 'rgba(244,242,237,.9)'; ctx.stroke(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
    }
    // marks and labels, most important first; a label that would collide drops out (the place stays tappable)
    const tierMax = f.zoom >= 3 ? 3 : f.zoom >= 1.8 ? 2 : 1;
    const ms = 9 * dpr, fs = 12 * dpr, boxes: number[][] = [];
    const marks = vis.filter((p) => !p.hide_label && (p.shape !== 'polyline' || (ROUTE.test(p.id) && routeOn) || p.id === f.sel));
    const rank = (p: Place) => (p.id === f.sel ? -1 : tierFor(p) * 10 + (p.shape === 'point' ? 0 : p.shape === 'polyline' ? 1 : 2));
    marks.sort((a, b) => rank(a) - rank(b));
    const hit = (bb: number[]) => boxes.some((o) => bb[0] < o[2] && bb[2] > o[0] && bb[1] < o[3] && bb[3] > o[1]);
    for (const p of marks) {
      const st = status(p), sel = p.id === f.sel;
      if (!sel && tierFor(p) > tierMax) continue;
      const [ax, ay] = P(...anchorOf(p, key)!);
      if (ax < -50 || ay < -50 || ax > W + 50 || ay > H + 50) continue;
      if (st === 'hidden') {
        const r = 10 * dpr, bb = [ax - r, ay - r, ax + r, ay + r];
        if (!sel && hit(bb)) continue;
        boxes.push(bb);
        ctx.beginPath(); ctx.arc(ax, ay, r, 0, 7); ctx.fillStyle = 'rgba(29,29,27,.72)'; ctx.fill();
        if (sel) { ctx.strokeStyle = PAPER; ctx.lineWidth = 2 * dpr; ctx.stroke(); }
        ctx.fillStyle = PAPER; ctx.font = `500 ${12 * dpr}px "DM Mono", ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', ax, ay + dpr); ctx.textAlign = 'left';
        continue;
      }
      const area = p.shape === 'polygon' || p.shape === 'circle', it = p.provenance === 'placed';
      const txt = area ? (it ? `· ${p.name.toUpperCase()} ·` : p.name.toUpperCase()) : p.name;
      ctx.font = `${it ? 'italic ' : ''}${area ? 500 : 400} ${fs}px "DM Mono", ui-monospace, monospace`;
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = area ? `${1.6 * dpr}px` : '0px';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width;
      let x = p.shape === 'point' ? ax + ms / 2 + 6 * dpr : p.shape === 'polyline' ? ax + 8 * dpr : ax - w / 2;
      const y = ay;
      if (x + w > W - 6 * dpr) x = p.shape === 'point' ? ax - ms / 2 - 6 * dpr - w : W - 6 * dpr - w;
      if (x < 6 * dpr) x = 6 * dpr;
      const b = [x - 4 * dpr, y - fs * 0.75, x + w + 4 * dpr, y + fs * 0.75], pb = p.shape === 'point' ? [ax - ms, ay - ms, ax + ms, ay + ms] : null;
      if (!sel && (hit(b) || (pb && hit(pb)))) continue;
      boxes.push(b);
      if (pb) boxes.push(pb);
      if (p.shape === 'point') {
        if (!it) { ctx.fillStyle = PAPER; ctx.fillRect(ax - ms / 2 - 2 * dpr, ay - ms / 2 - 2 * dpr, ms + 4 * dpr, ms + 4 * dpr); ctx.fillStyle = INK; ctx.fillRect(ax - ms / 2, ay - ms / 2, ms, ms); }
        else { ctx.beginPath(); ctx.arc(ax, ay, ms / 2 + 1.5 * dpr, 0, 7); ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 2.2 * dpr; ctx.strokeStyle = INK; ctx.stroke(); }
        if (sel) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(ax - ms - 3 * dpr, ay - ms - 3 * dpr, 2 * ms + 6 * dpr, 2 * ms + 6 * dpr); }
      }
      if (sel) { ctx.fillStyle = INK; ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.fillStyle = PAPER; ctx.fillText(txt, x, y); }
      else {
        ctx.lineWidth = 3.6 * dpr; ctx.strokeStyle = 'rgba(244,242,237,.92)'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = st === 'revealed' ? '#B3306E' : area && /sea|inlet/i.test(p.name) ? '#1E3F5A' : INK; ctx.fillText(txt, x, y);
      }
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    }
    const kmBar = nice(((70 * dpr) / S) * km), t = `${kmBar} KM`, wpx = Math.round(((kmBar / km) * S) / dpr);
    setScale((o) => (o.t === t && o.w === wpx ? o : { t, w: wpx }));
  }, [data, vd, key, desk, f, status, anchorOf, coordsOf]);

  useEffect(() => { paintRef.current = paint; paint(); }, [paint]);
  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    if (document.fonts) document.fonts.ready.then(() => paint());
    return () => ro.disconnect();
  }, [paint]);

  // pointers: drag pans, two fingers pinch, a tap selects; the wheel zooms at the cursor
  const ptrs = useRef(new Map<number, Pt>());
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; d0?: number; z0?: number } | null>(null);
  const zoomAt = useCallback((z: number, cx?: number, cy?: number) => {
    setF((g) => {
      const nz = Math.max(1, Math.min(8, z)), t = T.current, canvas = cv.current;
      if (t && canvas) {
        // keep the point under the cursor (or the middle) where it is
        const dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect(), W = canvas.width, H = canvas.height, k = nz / g.zoom;
        const mx = cx === undefined ? W / 2 : (cx - r.left) * dpr, my = cy === undefined ? H / 2 : (cy - r.top) * dpr;
        const c0 = t.c0, S1 = t.S * k;
        pan.current = [(mx - (mx - t.ox) * k - (W / 2 - c0[0] * S1)) / dpr, (my - (my - t.oy) * k - (H / 2 - c0[1] * S1)) / dpr];
      }
      return { ...g, zoom: nz };
    });
  }, [vd]);
  const tap = useCallback((clientX: number, clientY: number) => {
    const canvas = cv.current, t = T.current;
    if (!canvas || !t) return;
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = ((clientX - r.left) * dpr - t.ox) / t.S, y = ((clientY - r.top) * dpr - t.oy) / t.S, tol = (22 * dpr) / t.S;
    let best: string | null = null, bd = Infinity;
    for (const p of data.places) {
      if (p.hide_label) continue;
      const Q = coordsOf(p, key);
      if (!Q || !Q.length) continue;
      let dd = Infinity;
      if (p.shape === 'point') dd = Math.hypot(x - Q[0][0], y - Q[0][1]);
      else if (p.shape === 'polyline') { if (!ROUTE.test(p.id) && p.id !== 'river') continue; for (let k = 0; k < Q.length - 1; k++) dd = Math.min(dd, segD(x, y, Q[k], Q[k + 1])); dd += tol * 0.2; }
      else if (p.shape === 'circle' ? Math.hypot(x - Q[0][0], y - Q[0][1]) < (p.r_km ?? 0) / vd.km_per_px : inPoly(x, y, Q)) dd = tol * 0.95;
      if (dd < tol && dd < bd) { bd = dd; best = p.id; }
    }
    setF((g) => ({ ...g, sel: best, panel: null }));
  }, [data, key, coordsOf, vd]);
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    (e.target as Element).setPointerCapture(e.pointerId);
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; drag.current = { x: 0, y: 0, px: pan.current[0], py: pan.current[1], moved: true, d0: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: f.zoom }; }
    else drag.current = { x: e.clientX, y: e.clientY, px: pan.current[0], py: pan.current[1], moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    const d = drag.current;
    if (!d) return;
    if (ptrs.current.size === 2 && d.d0) { const [a, b] = [...ptrs.current.values()]; zoomAt((d.z0! * Math.hypot(a[0] - b[0], a[1] - b[1])) / d.d0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (d.moved) { pan.current = [d.px + dx, d.py + dy]; paint(); }
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    const d = drag.current;
    if (ptrs.current.size === 0) { drag.current = null; if (d && !d.moved) tap(e.clientX, e.clientY); }
  };
  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(f.zoom * Math.exp(-e.deltaY / 400), e.clientX, e.clientY); };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [f.zoom, zoomAt]);

  const go = (v: number, extra: Partial<Frame> = {}) => { pan.current = [0, 0]; setF({ v, zoom: 1, c: null, sel: null, panel: null, ...extra }); };
  const placed = useMemo(() => data.places.filter((p) => p.provenance === 'placed' && !p.hide_label), [data]);
  const placedShown = placed.filter((p) => status(p) !== 'hidden');
  const openPlace = (p: Place) => {
    const vk: ViewKey = p.ns && p.ns.some(([x, y]) => x >= 0 && y >= 0 && x <= data.views.ns.w && y <= data.views.ns.h) && TIER[p.id] !== 1 ? 'ns' : p.dz && !p.world ? 'dz' : 'world';
    const v = VIEWS.findIndex((x) => x.k === vk);
    go(v, { sel: p.id, c: anchorOf(p, vk) });
  };

  const sel = f.sel ? data.places.find((p) => p.id === f.sel) : undefined;
  const st = sel ? status(sel) : null;
  const sheet = sel && st !== 'hidden' ? <Sheet p={sel} data={data} limit={limit} revealed={st === 'revealed'} onHide={() => setReveal((r) => r.filter((x) => x !== sel.id))} onClose={() => setF((g) => ({ ...g, sel: null }))} /> : null;
  const cover = sel && st === 'hidden' ? (
    <div className="wm-cover">
      <div className="wm-sheet-top"><span className="label">◌ Later chapter · hidden</span><button type="button" className="wm-x" onClick={() => setF((g) => ({ ...g, sel: null }))}>Close ✕</button></div>
      <p className="wm-cover-title">A place from after chapter {limit}</p>
      <p className="wm-body">Everything the world guide says about this place comes from a chapter you haven’t read yet.</p>
      <div className="wm-two">
        <button type="button" className="wm-btn is-ink" onClick={() => setF((g) => ({ ...g, sel: null }))}>Keep hidden</button>
        <button type="button" className="wm-btn" onClick={() => setReveal((r) => [...r, sel.id])}>Show anyway</button>
      </div>
    </div>
  ) : null;
  const about = <About data={data} placed={placedShown} total={placed.length} onPick={openPlace} />;
  const showDzegoInset = desk && key === 'world';
  const dzThumb = data.views.dz.image;

  return (
    <div ref={root} className={`wm ${desk ? 'is-desk' : 'is-phone'}`}>
      <div className="wm-map">
        <canvas ref={cv} className="wm-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label={`${V.title}. ${data.shortLabel}. Places are listed under "Placed by us" and in the tap sheets.`} />
        <div className="wm-top">
          {desk && <div className="wm-title"><span className="wm-title-t">{V.title}</span>{V.note && <span className="wm-note">{V.note}</span>}</div>}
          {!desk && V.note && <div className="wm-note wm-note-phone">{V.note}</div>}
          <div className="wm-views" role="tablist" aria-label="Views">
            {VIEWS.map((v, i) => <button key={v.k} type="button" role="tab" aria-selected={i === f.v} className={`wm-view ${i === f.v ? 'is-on' : ''}`} onClick={() => go(i)}>{v.t}</button>)}
          </div>
        </div>
        <div className="wm-zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(f.zoom * 1.5)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(f.zoom / 1.5)}>−</button>
        </div>
        {showDzegoInset && (
          <button type="button" className="wm-inset" onClick={() => go(3)}>
            <span className="wm-inset-img" style={{ backgroundImage: `url(${dzThumb})` }} />
            <span className="wm-inset-t">· DZEGO · INSET</span>
            <span className="wm-inset-n">(draft) The book doesn’t say where Dzego lies relative to the United Cities.</span>
          </button>
        )}
        <div className="wm-foot">
          <button type="button" className="ai-label wm-ai" aria-haspopup="dialog" onClick={() => setF((g) => ({ ...g, sel: null, panel: 'about' }))}>
            {data.shortLabel} <span aria-hidden="true">ⓘ</span>
            <span className="sr-only"> ({data.label} Opens how it was made)</span>
          </button>
          <span className="wm-scale"><span className="wm-scale-bar" style={{ width: scale.w }} />{scale.t}</span>
        </div>
      </div>
      {desk ? (
        <aside className="wm-side">{sheet ?? cover ?? (f.panel === 'list' ? <PlacedList placed={placedShown} total={placed.length} onPick={openPlace} data={data} /> : about)}</aside>
      ) : (
        <>
          <div className="wm-bar">
            <button type="button" className="wm-btn" onClick={() => setF((g) => ({ ...g, sel: null, panel: 'list' }))}>Placed by us · {placedShown.length}</button>
            <button type="button" className="wm-btn is-quiet" onClick={() => setF((g) => ({ ...g, sel: null, panel: 'about' }))}>About · report · errata</button>
          </div>
          {(sheet || cover || f.panel) && (
            <div className="wm-sheet" role="dialog" aria-modal="false" aria-label="Map details">
              <button type="button" className="wm-grab" aria-label="Close" onClick={() => setF((g) => ({ ...g, sel: null, panel: null }))}><span /></button>
              {sheet ?? cover ?? (f.panel === 'list' ? <PlacedList placed={placedShown} total={placed.length} onPick={openPlace} data={data} /> : about)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Sheet({ p, data, limit, revealed, onHide, onClose }: { p: Place; data: WorldMapData; limit: number; revealed: boolean; onHide: () => void; onClose: () => void }) {
  const s = data.sheets[p.name] ?? { prov: data.placedWhy[p.id] ?? '', lines: [] };
  const lines = s.lines.filter((l) => revealed || l.ch <= limit), hid = s.lines.length - lines.length, book = p.provenance === 'book';
  const chapters = [...new Set(lines.flatMap((l) => l.refs.split(/,\s*/).map(chapOf)))].filter(Boolean).sort((a, b) => a - b);
  const mail = `mailto:${data.links.email}?subject=${encodeURIComponent(`Map mistake: world ${p.id}`)}`;
  return (
    <div className="wm-place">
      {revealed && <button type="button" className="wm-revealed" onClick={onHide}><span>Past your chapter · shown anyway</span><span>Hide again</span></button>}
      <div className="wm-sheet-top">
        <span className={`wm-chip ${book ? 'is-book' : 'is-ours'}`}>{book ? 'From the book' : 'Placed by us'}</span>
        <button type="button" className="wm-x" onClick={onClose}>Close ✕</button>
      </div>
      <div><p className={`wm-name ${book ? '' : 'is-ours'}`}>{p.name}</p><p className="label wm-id">[{p.id}] · world</p></div>
      {s.prov && <p className="wm-body">{s.prov}</p>}
      <p className="label wm-qhead">{lines.length ? 'How we know · world guide lines, up to your chapter' : 'No lines up to your chapter'}</p>
      {lines.map((l) => (
        <div key={l.id} className={`wm-line ${book ? '' : 'is-ours'}`}>
          <p className="wm-line-t">{l.text}</p>
          <p className="label">{l.id} · Ch {l.ch} · {l.refs}</p>
        </div>
      ))}
      {hid > 0 && <p className="label wm-hidden">◌ {hid} more line{hid > 1 ? 's' : ''} from after chapter {limit} hidden</p>}
      {chapters.length > 0 && <p className="label wm-chapters">Chapters {chapters.map((c) => <a key={c} href={`/chapter/${c}`}>{c}</a>)}</p>}
      <p className="label wm-report"><a href={mail}>Report a mistake (email)</a><a href={data.links.issues} target="_blank" rel="noreferrer">Or open an issue</a></p>
    </div>
  );
}

function About({ data, placed, total, onPick }: { data: WorldMapData; placed: Place[]; total: number; onPick: (p: Place) => void }) {
  return (
    <div className="wm-about">
      <p className="label">ⓘ {data.shortLabel}</p>
      <p className="wm-decl">Map made with code written by Claude (a closed AI model) from real public elevation data, reshaped to fit the book. Made by Snowmoon Party, not by the author. Sources in the <a href={data.links.recipe} target="_blank" rel="noreferrer">recipe</a>.</p>
      <p className="wm-body">{data.textureNote}</p>
      <p className="label">GPL-3.0, like the book.</p>
      <a className="wm-btn wm-link" href={data.links.errata} target="_blank" rel="noreferrer">Errata · where the book disagrees with itself →</a>
      <PlacedList placed={placed} total={total} onPick={onPick} data={data} compact />
    </div>
  );
}

function PlacedList({ placed, total, onPick, data, compact }: { placed: Place[]; total: number; onPick: (p: Place) => void; data: WorldMapData; compact?: boolean }) {
  return (
    <div className="wm-list">
      {compact ? <p className="label wm-list-head"><span>Placed by us · {placed.length}</span><a href={data.links.placed} target="_blank" rel="noreferrer">Full list →</a></p> : (
        <>
          <p className="wm-list-title">Placed by us · {placed.length}</p>
          <p className="wm-body">The book doesn’t say where these are, so we chose. Tap one to see it on the map.{placed.length < total ? ` ${total - placed.length} more come after the chapter you’ve reached.` : ''}</p>
        </>
      )}
      {placed.map((p) => <button key={p.id} type="button" className="wm-list-item" onClick={() => onPick(p)}><span>{p.name}</span><span className="label">[{p.id}]</span></button>)}
      <p className="label wm-report"><a href={`mailto:${data.links.email}?subject=${encodeURIComponent('Map mistake: world ')}`}>Report a mistake (email)</a><a href={data.links.issues} target="_blank" rel="noreferrer">Or open an issue</a></p>
      {!compact && <a className="label" href={data.links.placed} target="_blank" rel="noreferrer">Full list with reasons →</a>}
    </div>
  );
}
