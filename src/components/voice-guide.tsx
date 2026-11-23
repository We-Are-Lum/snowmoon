'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { useChallengeModel } from '~/components/challenge-model-row';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { angleById, planToBoard, SCENE, sceneWords, sentencesIn, type PlanShot, type Scene, type Shot, type Timeline } from '~/lib/voice/board';
import type { GuideDraft, GuideMessage, GuideRef, GuideStep } from '~/lib/voice/guide';
import '../styles/voice.css';

/**
 * /storyboard/guide/<draft id>: the guided storyboard (Nate, 2026-11-22/23; DRAFT; docs/proposals/storyboard-scene.md
 * v3). One conversation, top to bottom: 1. the scene (where he speaks from, the light, the mood), 2. his clothing, the
 * scene picture, 3. the shot plan from the speech's numbered sentences, 4. each shot's prompt and references, 5. fixes
 * by asking. The person asks in their own words; the guide drafts; the person uses a draft, edits it, or asks again;
 * nothing is made until they press Make. Each guide message names the model that wrote it. "I'll write it myself"
 * opens the storyboard's own form (v2). Pictures are kept on the storyboard; the closing card, the play-through and
 * publishing stay on the storyboard page.
 */
interface Sheet { id: string; title: string; entity: string; text: string; thumb: string | null; samples?: string[] }
interface Board {
  draft: { id: string; kind: string; speech: { id: string; title: string; label?: { text: string } } | null; sentences: { n: number; text: string }[]; timeline: Timeline };
  board: { version: number; cuts: number[]; shots: Shot[]; scene?: Scene; closing: unknown };
  pictures: { shotKey: string; sha256: string; recipe: Record<string, unknown> }[];
  sheets: { styles: Sheet[]; characters: Sheet[] };
  making: { models: ModelRowEntry[]; defaultModel: string | null; real: boolean; standIn: boolean; limits: { maxShots: number; maxTriesPerShot: number }; tries: Record<string, number> };
  settingQuote?: { text: string; block: string } | null;
}
interface Try { image: string; sha256: string; ticket: string; recipe: Record<string, unknown> }

function KeptPicture({ draftId, shot, sha, alt }: { draftId: string; shot: string; sha: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void authFetch(`/api/voice/boards/picture?draft=${draftId}&shot=${shot}&sha=${sha}`).then(async (r) => {
      if (!r.ok || !alive) return;
      made = URL.createObjectURL(await r.blob());
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [draftId, shot, sha]);
  return url ? <img src={url} alt={alt} className="vg-pic" /> : <div className="vg-pic vg-empty">Loading the picture…</div>;
}

export function VoiceGuide({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const params = useParams<{ draft: string }>();
  const draftId = String(params?.draft ?? '');
  const [d, setD] = useState<Board | null | 'none'>(null);
  const [msgs, setMsgs] = useState<GuideMessage[]>([]);
  const [model, setModel] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [cuts, setCuts] = useState<number[]>([]);
  const [scene, setScene] = useState<Scene>({ setting: '', kept: null });
  const [look, setLook] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [tries, setTries] = useState<Record<string, Try[]>>({});
  const [triesMade, setTriesMade] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  // The draft being worked on: the guide's text as the person may edit it, and the references as chosen.
  const [edit, setEdit] = useState<{ id: string; text: string; refs: { role: GuideRef['role']; ref: string; why: string }[] } | null>(null);
  const m = useChallengeModel(d && d !== 'none' ? d.making.models : undefined, null, d && d !== 'none' ? d.making.defaultModel : null);

  const load = useCallback(async () => {
    const [b, g] = await Promise.all([authFetch(`/api/voice/boards?draft=${draftId}`, { cache: 'no-store' }).catch(() => null), authFetch(`/api/voice/guide?draft=${draftId}`, { cache: 'no-store' }).catch(() => null)]);
    if (!b?.ok || !g?.ok) return setD('none');
    const bj = (await b.json()) as Board;
    const gj = (await g.json()) as { messages: GuideMessage[]; model: string };
    setD(bj);
    setMsgs(gj.messages);
    setModel(gj.model);
    setShots(bj.board.shots);
    setCuts(bj.board.cuts);
    setScene(bj.board.scene ?? { setting: '', kept: null });
    setLook(bj.board.shots.find((s) => !s.insert)?.characterIds[0] ?? null);
    setStyle(bj.board.shots[0]?.styleId ?? null);
    setTriesMade(bj.making.tries ?? {});
  }, [draftId]);
  useEffect(() => {
    if (auth.kind === 'signed-in' && draftId) void load();
  }, [auth.kind, draftId, load]);

  const ok = d && d !== 'none' ? d : null;
  const looks = useMemo(() => (ok ? ok.sheets.characters.filter((c) => /ephelion/i.test(`${c.title} ${c.entity}`)) : []), [ok]);
  const lastGuide = (step: GuideStep, shotKey?: string) => [...msgs].reverse().find((x) => x.role === 'guide' && x.step === step && (!shotKey || (x.draft as { shotKey?: string } | null)?.shotKey === shotKey)) ?? null;
  // The plan is used once its cameras are on the board (planToBoard marks each shot angleBy 'guide').
  const planned = shots.some((s) => s.angleBy === 'guide');
  // Where the person is: the first step not yet done.
  const stage: 'setting' | 'clothing' | 'scene' | 'plan' | 'shots' = !scene.setting.trim() ? 'setting' : !look || !scene.clothing ? 'clothing' : !scene.kept ? 'scene' : !planned ? 'plan' : 'shots';

  if (auth.kind !== 'signed-in' || d === 'none') return <>{fallback}</>;
  if (!ok) return <main className="vr vg"><p className="vr-note">Loading…</p></main>;
  const t = ok.draft.timeline;
  const speechLabel = ok.draft.speech?.label?.text ?? 'Book';
  const shot = shots[current];
  const lookSheet = looks.find((c) => c.id === look) ?? null;

  async function save(next: { shots?: Shot[]; cuts?: number[]; scene?: Scene }): Promise<boolean> {
    const body = { draftId: ok!.draft.id, cuts: next.cuts ?? cuts, shots: (next.shots ?? shots).map((s) => ({ ...s, styleId: style, characterIds: s.insert ? s.characterIds : look ? [look] : [] })), scene: next.scene ?? scene, closing: ok!.board.closing };
    const r = await authFetch('/api/voice/boards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { shots?: Shot[]; cuts?: number[]; scene?: Scene; error?: string };
    if (!r.ok) return setMessage(j.error ?? 'It could not be saved'), false;
    if (j.shots) setShots(j.shots);
    if (j.cuts) setCuts(j.cuts);
    if (j.scene) setScene(j.scene);
    return true;
  }
  async function askGuide(step: GuideStep, text: string, shotKey?: string) {
    if (!text.trim()) return;
    setBusy('guide');
    setMessage(null);
    const r = await authFetch('/api/voice/guide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: ok!.draft.id, step, text, shotKey, look: lookSheet ? { id: lookSheet.id, title: lookSheet.title, text: lookSheet.text } : null }) });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as { person?: { id: string; n: number; text: string }; guide?: { id: string; n: number; say: string; draft: GuideDraft; model: string }; error?: string };
    const now = new Date().toISOString();
    const added: GuideMessage[] = [];
    if (j.person) added.push({ id: j.person.id, n: j.person.n, role: 'person', step, text: j.person.text ?? text, draft: null, model: null, madeAt: now });
    if (j.guide) added.push({ id: j.guide.id, n: j.guide.n, role: 'guide', step, text: j.guide.say, draft: j.guide.draft, model: j.guide.model, madeAt: now });
    setMsgs((x) => [...x, ...added]);
    setAsk('');
    if (!r.ok) return setMessage(j.error ?? 'The guide did not answer');
    const g = j.guide!;
    if (step === 'shot' || step === 'fix') {
      const dd = g.draft as { prompt: string; references: GuideRef[] };
      setEdit({ id: g.id, text: dd.prompt, refs: dd.references });
    } else if (step === 'setting' || step === 'clothing') setEdit({ id: g.id, text: step === 'setting' ? (g.draft as { setting: string }).setting : (g.draft as { clothing: string }).clothing, refs: [] });
  }
  async function makePicture(key: string, description: string, guide: Record<string, unknown> | null, angle?: string) {
    setBusy(`make-${key}`);
    setMessage(null);
    const body = { draftId: ok!.draft.id, shotKey: key, description, angle, styleId: style, characterIds: key === SCENE.key ? (look ? [look] : []) : shots.find((s) => s.key === key)?.insert ? shots.find((s) => s.key === key)!.characterIds : look ? [look] : [], ...(guide ? { guide } : {}), ...m.body() };
    const r = await authFetch('/api/voice/boards/picture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as Try & { error?: string };
    if (!r.ok) return setMessage(j.error ?? 'The picture could not be made');
    setTries((x) => ({ ...x, [key]: [...(x[key] ?? []), j] }));
    setTriesMade((x) => ({ ...x, [key]: (x[key] ?? 0) + 1 }));
  }
  async function keep(key: string, tr: Try) {
    setBusy('keep');
    const r = await authFetch('/api/voice/boards/keep', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: tr.ticket, image: tr.image }) });
    setBusy(null);
    if (!r.ok) return setMessage('It could not be kept');
    if (key === SCENE.key) await save({ scene: { ...scene, kept: tr.sha256 } });
    else await save({ shots: shots.map((s) => (s.key === key ? { ...s, kept: tr.sha256 } : s)) });
  }
  const triesFor = (key: string) => (
    <div className="vg-tries">
      {(tries[key] ?? []).map((tr, i) => {
        const keptSha = key === SCENE.key ? scene.kept : shots.find((s) => s.key === key)?.kept;
        return (
          <figure key={tr.sha256} className={`vg-try${keptSha === tr.sha256 ? ' vg-on' : ''}`}>
            <img src={tr.image} alt={`Try ${i + 1}`} />
            <figcaption>
              {keptSha === tr.sha256 ? <span className="vr-ok">Kept</span> : <button type="button" className="vr-btn vr-small-btn" onClick={() => keep(key, tr)} disabled={busy !== null}>Keep this one</button>}
              <details>
                <summary>Recipe</summary>
                <pre>{JSON.stringify(tr.recipe, null, 2)}</pre>
              </details>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
  const byGuide = (x: GuideMessage) => (
    <p className="vg-by">
      Guide · {x.model} {/stand-in/.test(x.model ?? '') ? '' : '(open model)'} · drafted from your words
    </p>
  );
  const keptKeys = shots.filter((s) => s.kept).map((s) => s.key);
  const refChoices = (s: Shot) => [
    ...(!s.insert && scene.kept ? [{ role: 'anchor-scene' as const, ref: SCENE.key, label: 'the scene' }] : []),
    ...(lookSheet && (!s.insert || s.characterIds.length) ? [{ role: 'anchor-look' as const, ref: lookSheet.id, label: `his look (${lookSheet.title})` }] : []),
    ...keptKeys.filter((k) => k !== s.key && !s.insert).map((k) => ({ role: (k === shots.slice(0, shots.indexOf(s)).reverse().find((x) => !x.insert && x.kept)?.key ? 'continuity' : 'other') as GuideRef['role'], ref: k, label: `shot ${shots.findIndex((x) => x.key === k) + 1} as kept` })),
  ];

  return (
    <main className="vr vg">
      <p className="vr-kicker">The Ephelion challenge · Storyboard · Draft</p>
      <h1>{ok.draft.speech?.title ?? 'Storyboard'}</h1>
      <p className="vr-small">
        <span className="vr-tag">{speechLabel}</span> The guide drafts; you choose. Nothing is made until you press Make. ·{' '}
        <Link href={`/storyboard/board/${ok.draft.id}`}>I&rsquo;ll write it myself</Link>
      </p>
      <ol className="vg-steps" aria-label="Where you are">
        {(['setting', 'clothing', 'scene', 'plan', 'shots'] as const).map((x, i) => (
          <li key={x} className={x === stage ? 'vg-now' : ['setting', 'clothing', 'scene', 'plan', 'shots'].indexOf(stage) > i ? 'vg-done' : ''}>
            {['Scene', 'Clothing', 'Scene picture', 'Plan', 'Shots'][i]}
          </li>
        ))}
      </ol>
      {message && <p className="vr-warn" role="alert">{message}</p>}

      {/* The dialogue, top to bottom: every message, the person's word for word, the guide's with its model. */}
      <section className="vg-dialogue" aria-label="Your dialogue with the guide">
        <div className="vg-msg vg-guide">
          <p className="vg-by">Guide</p>
          <p>Let&rsquo;s build the one scene every shot is filmed in: one place, one light, one set of clothes.</p>
          {ok.settingQuote && (
            <blockquote className="vg-book">
              <span className="vr-tag">Book</span> {ok.settingQuote.block} · {ok.settingQuote.text}
            </blockquote>
          )}
          <p>{ok.settingQuote ? 'The book doesn’t say where he is. ' : ''}Where is he speaking from, and what are the light and the mood?</p>
        </div>
        {msgs.map((x) => (
          <div key={x.id} className={`vg-msg ${x.role === 'person' ? 'vg-person' : 'vg-guide'}`}>
            {x.role === 'person' ? <p className="vg-by">You</p> : byGuide(x)}
            <p>{x.text}</p>
            {x.role === 'guide' && x.draft && 'setting' in x.draft && <p className="vg-draft">{x.draft.setting}</p>}
            {x.role === 'guide' && x.draft && 'clothing' in x.draft && <p className="vg-draft">{x.draft.clothing}</p>}
            {x.role === 'guide' && x.draft && 'plan' in x.draft && (
              <ol className="vg-plan">
                {x.draft.plan.map((p: PlanShot, i) => (
                  <li key={i}>
                    Sentences {p.sentences[0] + 1}
                    {p.sentences.length > 1 ? `–${p.sentences[p.sentences.length - 1] + 1}` : ''} · {p.insert ? <span className="vg-ins">Insert, proposed</span> : (angleById(p.camera)?.label ?? 'no camera')}
                    {p.why && <span className="vr-small"> · {p.why}</span>}
                  </li>
                ))}
              </ol>
            )}
            {x.role === 'guide' && x.draft && 'prompt' in x.draft && <p className="vg-draft">{x.draft.prompt}</p>}
          </div>
        ))}
      </section>

      {/* The current step's card: use the draft, edit it, or ask again. */}
      <section className="vr-card vg-card" aria-labelledby="vg-step-h">
        {stage === 'setting' && (() => {
          const g = lastGuide('setting');
          return (
            <>
              <h2 id="vg-step-h">1. The scene</h2>
              {g && edit?.id === g.id && (
                <>
                  <label className="vb-field"><span className="vb-label">The setting (the guide&rsquo;s draft; edit it if you like)</span>
                    <textarea rows={3} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                  </label>
                  <button type="button" className="vr-btn" disabled={busy !== null || !edit.text.trim()} onClick={() => save({ scene: { ...scene, setting: edit.text, settingFrom: g.id } }).then(() => setEdit(null))}>Use this</button>
                </>
              )}
            </>
          );
        })()}
        {stage === 'clothing' && (() => {
          const g = lastGuide('clothing');
          return (
            <>
              <h2 id="vg-step-h">2. His clothing</h2>
              <p className="vr-small">His look, then what he wears in this scene, in your words.</p>
              <div className="vb-look-row">
                {looks.map((c) => (
                  <button key={c.id} type="button" className={`vb-look${look === c.id ? ' vb-on' : ''}`} aria-pressed={look === c.id} onClick={() => setLook(c.id)}>
                    {c.thumb ? <img src={c.thumb} alt="" /> : <span className="vb-look-none">No picture</span>}
                    <span className="vr-small">{c.title}</span>
                  </button>
                ))}
              </div>
              <label className="vb-field"><span className="vb-label">Style</span>
                <select value={style ?? ''} onChange={(e) => setStyle(e.target.value || null)}>
                  <option value="">None</option>
                  {ok.sheets.styles.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </label>
              {g && edit?.id === g.id && (
                <>
                  <label className="vb-field"><span className="vb-label">What he wears (the guide&rsquo;s draft; edit it if you like)</span>
                    <textarea rows={2} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                  </label>
                  <button type="button" className="vr-btn" disabled={busy !== null || !look || !edit.text.trim()} onClick={() => save({ scene: { ...scene, clothing: edit.text, clothingFrom: g.id } }).then(() => setEdit(null))}>Use this</button>
                </>
              )}
            </>
          );
        })()}
        {stage === 'scene' && (
          <>
            <h2 id="vg-step-h">The scene picture</h2>
            <p className="vg-draft">{sceneWords(scene)}</p>
            <p className="vr-small">A wide shot at eye level, with his look as its one reference. Every shot in the scene is made with it.</p>
            {m.notice}
            <button type="button" className="vr-btn" disabled={busy !== null || (triesMade[SCENE.key] ?? 0) >= ok.making.limits.maxTriesPerShot} onClick={() => { const go = () => void makePicture(SCENE.key, sceneWords(scene), scene.settingFrom ? { messageId: scene.settingFrom, clothingId: scene.clothingFrom } : null, 'wide'); if (!m.askFirst(go)) go(); }}>
              {busy === `make-${SCENE.key}` ? 'Making…' : (triesMade[SCENE.key] ?? 0) ? 'Try again' : 'Make the scene'}
            </button>
            {triesFor(SCENE.key)}
          </>
        )}
        {stage === 'plan' && (() => {
          const g = lastGuide('plan');
          const plan = g?.draft && 'plan' in g.draft ? g.draft.plan : null;
          return (
            <>
              <h2 id="vg-step-h">3. The shot plan</h2>
              {scene.kept && <KeptPicture draftId={ok.draft.id} shot={SCENE.key} sha={scene.kept} alt="The scene, as kept" />}
              <p className="vr-small">Ask for the shots you want (or just &ldquo;plan it&rdquo;): the guide groups the speech&rsquo;s sentences into shots, with cameras and any inserts. You can change any of it.</p>
              {plan && (
                <button type="button" className="vr-btn" disabled={busy !== null} onClick={() => { const b = planToBoard(t, plan, shots); void save({ cuts: b.cuts, shots: b.shots }); }}>
                  Use this plan ({plan.length} shots)
                </button>
              )}
            </>
          );
        })()}
        {stage === 'shots' && shot && (() => {
          const g = lastGuide('fix', shot.key) && (!lastGuide('shot', shot.key) || lastGuide('fix', shot.key)!.n > lastGuide('shot', shot.key)!.n) ? lastGuide('fix', shot.key) : lastGuide('shot', shot.key);
          const working = edit && g && edit.id === g.id ? edit : null;
          const keptSha = shot.kept;
          return (
            <>
              <div className="vb-shot-head">
                <h2 id="vg-step-h">4. Shot {current + 1} of {shots.length}{shot.insert ? ' · Insert, outside the scene' : ` · ${angleById(shot.angle)?.label ?? ''}`}</h2>
              </div>
              <blockquote className="vb-words"><span className="vr-tag">{speechLabel}</span> {sentencesIn(t, shot).map((n) => ok.draft.sentences.find((x) => x.n === n)?.text ?? '').join(' ')}</blockquote>
              {!g && <p className="vr-small">Say what this shot shows, in your words; the guide writes its prompt and picks its references.</p>}
              {working && (
                <>
                  <label className="vb-field"><span className="vb-label">The prompt (the guide&rsquo;s draft; edit it if you like)</span>
                    <textarea rows={4} value={working.text} onChange={(e) => setEdit({ ...working, text: e.target.value })} />
                  </label>
                  <fieldset className="vg-refs"><legend className="vb-label">Reference pictures (at most 3)</legend>
                    {refChoices(shot).map((c) => {
                      const on = working.refs.some((r) => r.ref === c.ref);
                      const why = working.refs.find((r) => r.ref === c.ref)?.why;
                      return (
                        <label key={c.ref} className="vb-toggle">
                          <input type="checkbox" checked={on} disabled={!on && working.refs.length >= 3} onChange={() => setEdit({ ...working, refs: on ? working.refs.filter((r) => r.ref !== c.ref) : [...working.refs, { role: c.role, ref: c.ref, why: 'chosen by you' }] })} />
                          {c.label}{why ? <span className="vr-small"> · {why}</span> : null}
                        </label>
                      );
                    })}
                  </fieldset>
                  {m.notice}
                  <button type="button" className="vr-btn" disabled={busy !== null || !working.text.trim() || (triesMade[shot.key] ?? 0) >= ok.making.limits.maxTriesPerShot} onClick={async () => {
                    const next = shots.map((s) => (s.key === shot.key ? { ...s, description: working.text, guideFrom: working.id } : s));
                    if (!(await save({ shots: next }))) return;
                    const go = () => void makePicture(shot.key, working.text, { messageId: working.id, references: working.refs.map((r) => ({ role: r.role, ref: r.ref })) }, shot.angle);
                    if (!m.askFirst(go)) go();
                  }}>
                    {busy === `make-${shot.key}` ? 'Making…' : (triesMade[shot.key] ?? 0) ? 'Try again' : 'Make the picture'}
                  </button>
                </>
              )}
              {g && !working && <button type="button" className="vr-btn vr-quiet vr-small-btn" onClick={() => { const dd = g.draft as { prompt: string; references: GuideRef[] }; setEdit({ id: g.id, text: dd.prompt, refs: dd.references }); }}>Use the guide&rsquo;s last draft</button>}
              {triesFor(shot.key)}
              {keptSha && !(tries[shot.key] ?? []).some((tr) => tr.sha256 === keptSha) && <KeptPicture draftId={ok.draft.id} shot={shot.key} sha={keptSha} alt={`Shot ${current + 1}, as kept`} />}
              <div className="vr-row">
                <button type="button" className="vr-btn vr-quiet" disabled={current === 0} onClick={() => { setCurrent(current - 1); setEdit(null); }}>Previous shot</button>
                <button type="button" className="vr-btn vr-quiet" disabled={current === shots.length - 1} onClick={() => { setCurrent(current + 1); setEdit(null); }}>Next shot</button>
              </div>
              {shots.every((s) => s.kept) && <p className="vr-ok">Every shot has a picture. <Link href={`/storyboard/board/${ok.draft.id}`}>Open the storyboard</Link> for the closing card, the play-through and publishing.</p>}
            </>
          );
        })()}
        {/* Ask the guide, in your own words: the request is kept word for word with what it drafts. */}
        <form
          className="vg-composer"
          onSubmit={(e) => {
            e.preventDefault();
            const step: GuideStep = stage === 'setting' ? 'setting' : stage === 'clothing' ? 'clothing' : stage === 'plan' ? 'plan' : shot && (lastGuide('shot', shot.key) || shot.kept) ? 'fix' : 'shot';
            void askGuide(step, ask, stage === 'shots' ? shot?.key : undefined);
          }}
        >
          <label className="sr-only" htmlFor="vg-ask">Ask the guide</label>
          <input id="vg-ask" value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={1000} placeholder={stage === 'setting' ? 'Where is he, what light, what mood?' : stage === 'clothing' ? 'What does he wear in this scene?' : stage === 'plan' ? 'How should the shots go?' : stage === 'scene' ? 'Make the scene picture above first' : 'What should this shot show? Or a fix, e.g. “make him lean in”'} disabled={stage === 'scene' || busy !== null} />
          <button type="submit" className="vr-btn" disabled={!ask.trim() || busy !== null || stage === 'scene'}>{busy === 'guide' ? '…' : 'Send'}</button>
        </form>
        <p className="vr-small">Your words are kept with the storyboard, and published with each picture they asked for if you publish it. The guide runs on {model}{/stand-in/.test(model) ? '' : ' (an open model, on the assistant’s provider)'}; it never writes the speech&rsquo;s words.</p>
      </section>
    </main>
  );
}
