'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { SetStage, ShotCamera, PersonSpec } from './set3d';
import { LocalTextField } from '~/components/local-text-field';
import { RemixPanel } from './remix-panel';
import { AddToStoryboard } from './add-to-storyboard';

/**
 * The live shot editor (owner, 2026-10-17: "Ship a live editor on the site by Sunday"; boards 1-3 of
 * the editor prototype). Read and play only: it reads a version's committed files (made into
 * public/editor/<id>/v<n>/ by scripts/editor-data.mjs), moves the camera and the people in the 3D
 * set, plays the converted lines, and lets the visitor edit the prompt and the line in this browser
 * only, until Remix: Generate (remix-panel.tsx) makes a frame from the camera the person set and saves it
 * to their remix of the shot; where Remix isn't set up (no keys or database, as on a preview) it is shown,
 * disabled, as "Remixing opens this week." Named Remix (owner, 2026-10-18). The recipe is on the
 * site (the RECIPE tab, also opened by #recipe); the repository is only the footer's Source link.
 */

type Vec3 = [number, number, number];
interface Line {
  cue: string;
  at: number;
  speaker: string | null;
  text: string | null;
  by: { kind: 'book'; cite: string } | { kind: 'person'; handle: string; on: string | null } | { kind: 'unknown' };
  note: string | null;
  voice: { src: string; name: string | null; sha256: string; file: string; model: { id: string; name?: string; licence?: string } | null } | null;
}
interface Pic {
  src: string;
  file: string;
  sha256: string;
  source?: { file: string; sha256: string } | null;
}
interface ChainStep {
  id: string;
  model: { id: string; name: string; licence: string; weights: string | null; host?: string } | null;
  seed: number | null;
  size: string | null;
  cost_usd: number;
  served_at: string | null;
  request_id: string | null;
  sha256: string | null;
  kind: string | null;
  note: string | null;
  references: { file: string; sha256: string | null }[];
}
interface Shot {
  id: string;
  /** The shot's id in the cut's timeline (id is the same, made safe for a link). */
  cutId: string;
  n: number;
  from: number;
  to: number;
  frameId: string;
  scene: string | null;
  setup: string | null;
  variant: string | null;
  size: string | null;
  action: string | null;
  who: string[];
  set: string | null;
  made: string | null;
  frame: string | null;
  thumb: string | null;
  setFrame: (Pic & { mode: string }) | null;
  camera: (ShotCamera & { set: string; key: string | null }) | null;
  plate: (Pic & { name: string }) | null;
  cards: (Pic & { who: string })[];
  recipe: { id: string; file: string | null; sha256: string; sentSha256: string | null; prompt: string | null; set: { file: string; sha256: string } | null; chain: ChainStep[]; cost_usd: number } | null;
  lines: Line[];
}
interface Preset {
  key: string;
  setup: string;
  size: string | null;
  scene: string | null;
  cam: Vec3;
  look: Vec3;
  fov: number;
  people: ShotCamera['people'];
}
export interface EditorData {
  adaptation: number;
  version: number;
  seed: string;
  title: string;
  author: { fid: number; handle: string };
  recipeFolder: string;
  sets: Record<string, string>;
  presets: Record<string, Preset[]>;
  shots: Shot[];
}

const NAMES: Record<string, string> = { Z: 'Zei', B: 'Bai', D: 'Deluin', K: 'Kau', R: 'The robot waiter' };
const SIZES: Record<string, string> = { CU: 'close-up', MCU: 'medium close-up', OTS: 'over the shoulder', MS: 'medium shot', WS: 'wide shot', ECU: 'extreme close-up', MASTER: 'master' };
const TABS = ['Line', 'Voice', 'Picture', 'Prompt', 'Recipe'] as const;
type Tab = (typeof TABS)[number];
const sec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const short = (h: string | null | undefined) => (h ? `${h.slice(0, 12)}…` : 'none');
const cmp = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const round = (c: ShotCamera): ShotCamera => JSON.parse(JSON.stringify(c, (_k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));

export function ShotEditor({
  dataUrl,
  shotId,
  handle,
  scenePath,
  aiLabel,
  prototypeUrl,
}: {
  dataUrl: string;
  shotId: string;
  handle: string;
  scenePath: string;
  aiLabel: string | null;
  prototypeUrl: string;
}) {
  const [data, setData] = useState<EditorData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(dataUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [dataUrl]);

  if (failed)
    return (
      <div className="ed ed-empty">
        <p className="label">The editor isn&rsquo;t available for this version yet.</p>
        <Link href={scenePath}>Back to the scene</Link>
      </div>
    );
  if (!data)
    return (
      <div className="ed ed-empty" aria-busy="true">
        <p className="label">Loading the shot…</p>
      </div>
    );
  // REMIX on the scene page opens /shot/first: the first shot with a camera to move.
  const i = shotId === 'first' ? Math.max(0, data.shots.findIndex((s) => s.camera && s.lines.length)) : data.shots.findIndex((s) => s.id === shotId);
  if (i < 0)
    return (
      <div className="ed ed-empty">
        <p className="label">Version {data.version} has no shot called {shotId}.</p>
        <Link href={`${scenePath}/shot/${data.shots[0].id}`}>Open the first shot</Link>
      </div>
    );
  return (
    <Editor
      key={shotId}
      data={data}
      shot={data.shots[i]}
      prev={data.shots[i - 1] ?? null}
      next={data.shots[i + 1] ?? null}
      handle={handle}
      scenePath={scenePath}
      aiLabel={aiLabel}
      prototypeUrl={prototypeUrl}
    />
  );
}

function Editor({
  data,
  shot,
  prev,
  next,
  handle,
  scenePath,
  aiLabel,
  prototypeUrl,
}: {
  data: EditorData;
  shot: Shot;
  prev: Shot | null;
  next: Shot | null;
  handle: string;
  scenePath: string;
  aiLabel: string | null;
  prototypeUrl: string;
}) {
  const orbitRef = useRef<HTMLCanvasElement>(null);
  const shotRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<SetStage | null>(null);
  const [start, setStart] = useState<ShotCamera | null>(null);
  const [cam, setCam] = useState<ShotCamera | null>(null);
  const [setError, setSetError] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  // #recipe (the scene page's Recipe link) opens on the RECIPE tab.
  const [tab, setTab] = useState<Tab>(() => (typeof location !== 'undefined' && location.hash === '#recipe' ? 'Recipe' : 'Line'));
  const [prompt, setPrompt] = useState(shot.recipe?.prompt ?? '');
  const [lineText, setLineText] = useState<Record<string, string>>(() => Object.fromEntries(shot.lines.map((l) => [l.cue, l.text ?? ''])));
  const shotPath = (s: Shot) => `${scenePath}/shot/${s.id}`;
  const presets = useMemo(() => {
    const all = (shot.camera && data.presets[shot.camera.set]) || [];
    const same = all.filter((p) => p.scene === shot.scene);
    return same.length ? same : all;
  }, [data, shot]);

  // The 3D set: loaded in the browser only (three.js stays out of the scene page's bundle).
  useEffect(() => {
    if (!shot.camera || !orbitRef.current || !shotRef.current) return;
    let stage: SetStage | null = null;
    let alive = true;
    (async () => {
      try {
        const [{ SetStage, normalise }, set] = await Promise.all([import('./set3d'), fetch(data.sets[shot.camera!.set]).then((r) => r.json())]);
        if (!alive || !orbitRef.current || !shotRef.current) return;
        const first = round(normalise(shot.camera!, set));
        stage = new SetStage(orbitRef.current, shotRef.current, set, first, (c) => setCam(round(c)));
        stageRef.current = stage;
        setStart(first);
        setCam(first);
        setWho(Object.keys(first.people)[0] ?? null);
      } catch {
        if (alive) setSetError(true);
      }
    })();
    return () => {
      alive = false;
      stage?.dispose();
      stageRef.current = null;
    };
  }, [data, shot]);

  // /shot/first (REMIX on the scene page) shows the real shot's address once it is known.
  useEffect(() => {
    if (location.pathname.endsWith('/shot/first')) history.replaceState(history.state, '', `${scenePath}/shot/${shot.id}${location.hash}`);
  }, [scenePath, shot.id]);

  const stage = () => stageRef.current;
  const camChanged = !!(cam && start) && !cmp({ cam: cam.cam, look: cam.look, fov: cam.fov }, { cam: start.cam, look: start.look, fov: start.fov });
  const peopleChanged = !!(cam && start) && !cmp(cam.people, start.people);
  const promptChanged = !!shot.recipe?.prompt && prompt !== shot.recipe.prompt;
  const lineChanges = shot.lines.filter((l) => (lineText[l.cue] ?? '') !== (l.text ?? ''));
  const anyChange = camChanged || peopleChanged || promptChanged || lineChanges.length > 0;
  const person = who && cam ? (cam.people[who] as PersonSpec | undefined) : undefined;
  const firstLine = shot.lines[0];
  const where = [shot.scene, shot.size && (SIZES[shot.size] ?? shot.size), `${(shot.to - shot.from).toFixed(1)} s`].filter(Boolean).join(' · ');

  return (
    <div className="ed">
      <p className="ed-banner label">
        Live editor · move the camera and the people, play the lines · Remix makes an AI frame from your camera, saved to your remix ·{' '}
        <a href={prototypeUrl}>where it&rsquo;s going</a>
      </p>

      <header className="ed-head">
        <nav className="ed-nav label" aria-label="Shots">
          <Link href={scenePath}>‹ {data.title}</Link>
          <span className="ed-nav-step">
            {prev ? (
              <Link href={shotPath(prev)} aria-label={`Shot ${prev.n}`}>
                ‹ Shot {prev.n}
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            {next && (
              <Link href={shotPath(next)} aria-label={`Shot ${next.n}`}>
                Shot {next.n} ›
              </Link>
            )}
          </span>
        </nav>
        <h1 className="ed-title">
          Shot {shot.n} <span className="ed-title-sub">{[shot.setup, shot.variant].filter(Boolean).join(' · ')}</span>
        </h1>
        {firstLine?.text && <p className="ed-quote">&ldquo;{firstLine.text}&rdquo;</p>}
        <p className="label ed-muted">
          {[firstLine?.speaker, firstLine?.cue, where, `${sec(shot.from)}–${sec(shot.to)} in version ${data.version}`].filter(Boolean).join(' · ')}
        </p>
      </header>

      <div className="ed-grid">
        <section className="ed-set" aria-label="3D set">
          {shot.camera ? (
            <>
              <div className="ed-panel-head label">
                <span>3D set · {shot.camera.set}</span>
                <span className="ed-muted">live in your browser</span>
              </div>
              <canvas ref={orbitRef} className="ed-orbit" aria-label="The 3D set. Drag to look around; drag the green camera, the green ring it looks at, or a person to move them." />
              <p className="ed-help">
                Drag to look around the set; pinch or scroll to zoom. Drag the green camera, the ring it looks at, or a person to move them.
              </p>
              {setError && <p className="ed-warn">The 3D set didn&rsquo;t load in this browser (it needs WebGL). Everything else still works.</p>}

              <fieldset className="ed-controls">
                <legend className="label">Start from one of the scene&rsquo;s camera setups</legend>
                <div className="ed-presets">
                  {presets.map((p) => (
                    <button key={p.key} type="button" className="ed-chip" aria-pressed={cam ? cmp([cam.cam, cam.look, cam.fov], [p.cam, p.look, p.fov]) : false} onClick={() => stage()?.setCamera({ cam: p.cam, look: p.look, fov: p.fov, people: { ...(cam?.people ?? {}), ...p.people } })}>
                      {p.setup}
                      {p.size ? ` · ${p.size}` : ''}
                    </button>
                  ))}
                </div>
                <label className="ed-slider">
                  <span className="label">Field of view {cam ? `${Math.round(cam.fov)}°` : ''}</span>
                  <input type="range" min={10} max={90} step={1} value={cam?.fov ?? 40} onChange={(e) => stage()?.setFov(+e.target.value)} disabled={!cam} />
                </label>
                <label className="ed-slider">
                  <span className="label">Height {cam ? `${cam.cam[1].toFixed(2)} m` : ''}</span>
                  <input type="range" min={0.3} max={8} step={0.05} value={cam?.cam[1] ?? 1.5} onChange={(e) => stage()?.setHeight(+e.target.value)} disabled={!cam} />
                </label>
                <div className="ed-row">
                  <span className="label ed-muted">
                    {cam ? `Camera ${cam.cam.map((v) => v.toFixed(1)).join(', ')} → ${cam.look.map((v) => v.toFixed(1)).join(', ')}` : ''}
                  </span>
                  <button type="button" className="ed-small" onClick={() => start && stage()?.setCamera(start)} disabled={!anyChange && !camChanged && !peopleChanged}>
                    Reset to version {data.version}
                  </button>
                </div>
              </fieldset>

              {cam && Object.keys(cam.people).length > 0 && (
                <fieldset className="ed-controls">
                  <legend className="label">People in this shot</legend>
                  <div className="ed-presets">
                    {Object.keys(cam.people).map((k) => (
                      <button key={k} type="button" className="ed-chip" aria-pressed={who === k} onClick={() => setWho(k)}>
                        {NAMES[k] ?? k}
                      </button>
                    ))}
                  </div>
                  {who && person && (
                    <div className="ed-row">
                      <button type="button" className="ed-small" aria-label={`Turn ${NAMES[who] ?? who} left`} onClick={() => stage()?.turnPerson(who, 45)}>
                        ⟲ Turn
                      </button>
                      <button type="button" className="ed-small" aria-label={`Turn ${NAMES[who] ?? who} right`} onClick={() => stage()?.turnPerson(who, -45)}>
                        Turn ⟳
                      </button>
                      {who !== 'R' && (
                        <label className="ed-pose">
                          <span className="label">Pose</span>
                          <select value={person.pose === 'standing' ? 'standing' : 'seated'} onChange={(e) => stage()?.setPose(who, e.target.value)}>
                            <option value="seated">Seated</option>
                            <option value="standing">Standing</option>
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                </fieldset>
              )}
            </>
          ) : (
            <div className="ed-made">
              <p className="label">No 3D set for this shot</p>
              <p>This shot is {shot.made ?? 'made in code'}, so there is no camera to move. Its line and voice are below.</p>
            </div>
          )}
        </section>

        <section className="ed-look" aria-label="The shot">
          {shot.camera && (
            <figure className="ed-fig">
              <canvas ref={shotRef} className="ed-layout" aria-label="Live grey layout: what your camera sees" />
              <figcaption className="label">
                Live layout from your camera {camChanged || peopleChanged ? '· changed' : `· as version ${data.version}`}
              </figcaption>
            </figure>
          )}
          <div className="ed-pair">
            <figure className="ed-fig">
              {shot.frame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot.frame} alt={`Shot ${shot.n} as drawn for version ${data.version}: ${shot.action ?? shot.frameId}`} width={1280} height={720} />
              ) : (
                <div className="ed-noimg label">{shot.made ?? 'Drawn in code'}</div>
              )}
              <figcaption className="label">
                The shot&rsquo;s frame · version {data.version}
                {shot.made ? ` · ${shot.made}` : ''}
              </figcaption>
            </figure>
            <figure className="ed-fig">
              {shot.setFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot.setFrame.src} alt={`The set frame the model was sent for shot ${shot.n} (${shot.setFrame.mode})`} width={1280} height={720} />
              ) : (
                <div className="ed-noimg label">No set frame</div>
              )}
              <figcaption className="label">Its set frame · as sent to the model{shot.setFrame ? ` · ${shot.setFrame.mode}` : ''}</figcaption>
            </figure>
          </div>
          {shot.frame && (
            <AddToStoryboard adaptation={data.adaptation} version={data.version} shot={shot.id} seconds={shot.to - shot.from} frame={null} boardPath={`${scenePath}/storyboard`} label={`Add this frame to a storyboard`} />
          )}
          {aiLabel && <p className="label ed-muted">{aiLabel}</p>}
          <p className="label ed-recipe-link">
            <a
              href="#recipe"
              onClick={(e) => {
                e.preventDefault();
                setTab('Recipe');
                document.getElementById('ed-tabs')?.scrollIntoView({ block: 'start' });
              }}
            >
              The recipe: every file this shot was made from
            </a>
          </p>

          <RemixPanel
            adaptation={data.adaptation}
            version={data.version}
            shotId={shot.id}
            shotN={shot.n}
            title={data.title}
            seconds={shot.to - shot.from}
            boardPath={`${scenePath}/storyboard`}
            depth={(w, h) => stageRef.current?.layoutPictures(w, h).depth ?? null}
            camera={cam}
          />

          <div className="ed-tabs" id="ed-tabs">
            <div role="tablist" aria-label="Layers" className="ed-tablist">
              {TABS.map((t) => (
                <button key={t} id={`ed-tab-${t}`} role="tab" type="button" aria-selected={tab === t} aria-controls={`ed-pane-${t}`} className="ed-tab" onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`ed-pane-${tab}`} aria-labelledby={`ed-tab-${tab}`} className="ed-pane">
              {tab === 'Line' &&
                (shot.lines.length ? (
                  shot.lines.map((l) => (
                    <div key={l.cue} className="ed-line">
                      <LocalTextField
                        id={`ed-line-${l.cue}`}
                        rows={2}
                        value={lineText[l.cue] ?? ''}
                        onChange={(v) => setLineText({ ...lineText, [l.cue]: v })}
                        label={
                          <>
                            {l.speaker ?? 'Line'} · {l.cue} · {l.by.kind === 'book' ? <>the book, {l.by.cite}</> : l.by.kind === 'person' ? <>by @{l.by.handle}{l.by.on ? `, ${l.by.on}` : ''}</> : 'author unknown'}
                          </>
                        }
                      />
                      <p className="ed-help">
                        {l.by.kind === 'book' ? "The book's own words." : `@${l.by.kind === 'person' ? l.by.handle : '?'}'s words, as performed.`} Your edit stays in this browser. Models never write lines.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>No line starts in this shot.</p>
                ))}
              {tab === 'Voice' &&
                (shot.lines.some((l) => l.voice) ? (
                  shot.lines
                    .filter((l) => l.voice)
                    .map((l) => (
                      <div key={l.cue} className="ed-line">
                        <p className="label">
                          {l.speaker} · {l.cue} · voice {l.voice!.name ?? 'designed'}
                        </p>
                        <audio controls preload="none" src={l.voice!.src} aria-label={`${l.speaker}: ${l.text}`} />
                        <p className="ed-help">
                          The converted line, as heard in version {data.version}: @{data.author.handle}&rsquo;s performance, converted to the character&rsquo;s designed voice
                          {l.voice!.model ? ` with ${l.voice!.model.name ?? l.voice!.model.id} (${l.voice!.model.licence})` : ''}. The raw take stays private.
                        </p>
                      </div>
                    ))
                ) : (
                  <p>No voice in this shot.</p>
                ))}
              {tab === 'Picture' && (
                <div className="ed-pics">
                  {shot.plate && (
                    <figure className="ed-fig">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shot.plate.src} alt={`The plate: ${shot.set ?? 'the place'}, empty`} />
                      <figcaption className="label">Plate · {shot.plate.name} · AI-generated image, not by the author</figcaption>
                    </figure>
                  )}
                  {shot.cards.map((c) => (
                    <figure key={c.src} className="ed-fig">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.src} alt={`Cast card: ${c.who}`} />
                      <figcaption className="label">Cast card · {c.who} · AI-generated image, not by the author</figcaption>
                    </figure>
                  ))}
                  {!shot.plate && !shot.cards.length && <p>This shot has no plate or cast card.</p>}
                </div>
              )}
              {tab === 'Prompt' &&
                (shot.recipe?.prompt ? (
                  <div className="ed-line">
                    <LocalTextField id="ed-prompt" rows={10} value={prompt} onChange={setPrompt} label={<>Prompt for {shot.recipe.id} {promptChanged ? '· edited' : ''}</>} />
                    <div className="ed-row">
                      <button type="button" className="ed-small" onClick={() => setPrompt(shot.recipe!.prompt!)} disabled={!promptChanged}>
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>This shot has no prompt: {shot.made ?? 'it was not made by a model'}.</p>
                ))}
              {tab === 'Recipe' && (
                <div className="ed-recipe">
                  {shot.recipe ? (
                    <>
                      <dl>
                        <dt className="label">Frame</dt>
                        <dd>
                          {shot.recipe.id} · sha256 <code>{shot.recipe.sha256}</code>
                        </dd>
                        {shot.recipe.file && (
                          <>
                            <dt className="label">Committed as</dt>
                            <dd>
                              <code>{shot.recipe.file}</code>
                            </dd>
                          </>
                        )}
                        {shot.recipe.set && (
                          <>
                            <dt className="label">Set</dt>
                            <dd>
                              <code>{shot.recipe.set.file}</code> · sha256 <code>{short(shot.recipe.set.sha256)}</code>
                            </dd>
                          </>
                        )}
                        {shot.setFrame && (
                          <>
                            <dt className="label">Set frame</dt>
                            <dd>
                              <code>{shot.setFrame.file}</code> · sha256 <code>{short(shot.setFrame.sha256)}</code>
                            </dd>
                          </>
                        )}
                        <dt className="label">Cost</dt>
                        <dd>${shot.recipe.cost_usd.toFixed(4)} for this frame&rsquo;s steps below</dd>
                      </dl>
                      <ol className="ed-chain">
                        {shot.recipe.chain.map((c) => (
                          <li key={c.id}>
                            <p className="label">{c.id}</p>
                            <p>
                              {c.model ? (
                                <>
                                  {c.model.weights ? <a href={c.model.weights}>{c.model.name}</a> : c.model.name} · {c.model.licence}
                                </>
                              ) : (
                                'no model recorded'
                              )}
                              {c.seed !== null && ` · seed ${c.seed}`}
                              {c.size && ` · ${c.size}`} · ${(c.cost_usd || 0).toFixed(4)}
                              {c.served_at && ` · ${c.served_at.slice(0, 10)}`}
                            </p>
                            {c.note && <p className="ed-help">{c.note}</p>}
                            <p className="ed-hash">
                              sha256 <code>{c.sha256 ?? 'none'}</code>
                              {c.request_id && (
                                <>
                                  {' '}
                                  · request <code>{c.request_id}</code>
                                </>
                              )}
                            </p>
                            {c.references.length > 0 && (
                              <ul>
                                {c.references.map((r) => (
                                  <li key={r.file + r.sha256}>
                                    <code>{r.file}</code> · <code>{short(r.sha256)}</code>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <p>This shot is {shot.made ?? 'made in code'}: the cut&rsquo;s scripts draw it again from committed files.</p>
                  )}
                  {shot.lines
                    .filter((l) => l.voice)
                    .map((l) => (
                      <p key={l.cue} className="ed-hash">
                        Voice {l.cue}: <code>{l.voice!.file}</code> · sha256 <code>{short(l.voice!.sha256)}</code>
                      </p>
                    ))}
                </div>
              )}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}
