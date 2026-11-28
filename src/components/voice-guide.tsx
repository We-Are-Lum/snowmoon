'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { useChallengeModel } from '~/components/challenge-model-row';
import { ConsentScreen, PublishedTextField } from '~/components/publish-words';
import { VoiceAllowance, nextAllowance, type Allowance } from '~/components/voice-allowance';
import { withReset } from '~/lib/challenge/model-wording';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { angleById, madeWithOf, planToBoard, SCENE, sceneWords, sentencesIn, staleShots, type MadeWith, type PlanShot, type Scene, type Shot, type Timeline } from '~/lib/voice/board';
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
  draft: { id: string; kind: string; speech: { id: string; title: string; label?: { text: string } } | null; sentences: { n: number; text: string }[]; take?: { label: string; improvised: boolean }; timeline: Timeline };
  board: { version: number; cuts: number[]; shots: Shot[]; scene?: Scene; closing: unknown };
  pictures: { shotKey: string; sha256: string; recipe: Record<string, unknown> }[];
  sheets: { styles: Sheet[]; characters: Sheet[] };
  making: { models: ModelRowEntry[]; defaultModel: string | null; real: boolean; standIn: boolean; limits: { maxShots: number; maxTriesPerShot: number }; tries: Record<string, number>; allowance?: Allowance | null };
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
  // Storyboard pictures left today (Nate, 2026-11-23), for everyone but admins; null when it doesn't apply.
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  // The own-words consent (as on the storyboard page): shown before a person's first picture made from their words.
  const [consent, setConsent] = useState<Parameters<typeof ConsentScreen>[0]['wording'] | null>(null);
  // The draft being worked on: the guide's text as the person may edit it, and the references as chosen.
  const [edit, setEdit] = useState<{ id: string; step: GuideStep; text: string; refs: { role: GuideRef['role']; ref: string; why: string }[] } | null>(null);
  // A picture that failed, said where it was asked for (fix 3).
  const [failed, setFailed] = useState<{ key: string; text: string } | null>(null);
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
    setAllowance(bj.making.allowance ?? null);
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
  // An improvised take's words are the performer's own (Nate, 2026-11-24).
  const speechLabel = ok.draft.take?.improvised ? 'Your words' : (ok.draft.speech?.label?.text ?? 'Book');
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
      setEdit({ id: g.id, step, text: dd.prompt, refs: dd.references });
    } else if (step === 'setting' || step === 'clothing') setEdit({ id: g.id, step, text: step === 'setting' ? (g.draft as { setting: string }).setting : (g.draft as { clothing: string }).clothing, refs: [] });
  }
  async function makePicture(key: string, description: string, guide: Record<string, unknown> | null, angle?: string) {
    setBusy(`make-${key}`);
    setMessage(null);
    setFailed(null);
    const body = { draftId: ok!.draft.id, shotKey: key, description, angle, styleId: style, characterIds: key === SCENE.key ? (look ? [look] : []) : shots.find((s) => s.key === key)?.insert ? shots.find((s) => s.key === key)!.characterIds : look ? [look] : [], ...(guide ? { guide } : {}), ...m.body() };
    const r = await authFetch('/api/voice/boards/picture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(null);
    const j = (await r.json().catch(() => ({}))) as Try & { error?: string; reason?: string; left?: number; resetAt?: string };
    setAllowance((a) => nextAllowance(a, j));
    if (r.status === 403 && j.reason === 'consent') {
      const c = await authFetch('/api/consent').catch(() => null);
      if (c?.ok) return setConsent(((await c.json()) as { wording: Parameters<typeof ConsentScreen>[0]['wording'] }).wording);
    }
    // Out of the allowance or the pool: the allowance's own line (VoiceAllowance) says so, with when it comes back.
    if (!r.ok) return j.reason === 'storyboard-limit' || j.reason === 'storyboard-spend' ? undefined : setFailed({ key, text: j.error && j.resetAt ? withReset(j.error, j.resetAt) : `The picture could not be made: ${j.error ?? 'the model did not answer'}. Try again in a moment.` });
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
  // Fix 1 (Nate, 2026-11-24): a shot kept with another look, or before this scene, is not this scene's picture: it isn't
  // shown as the shot's picture, offered as a reference, or counted as done (the server leaves it out too).
  const made: Record<string, MadeWith | undefined> = {};
  for (const s of shots) {
    const rec = s.kept ? ([...ok.pictures, ...(tries[s.key] ?? []).map((tr) => ({ shotKey: s.key, sha256: tr.sha256, recipe: tr.recipe }))].find((p) => p.shotKey === s.key && p.sha256 === s.kept)?.recipe ?? null) : null;
    made[s.key] = rec ? madeWithOf(rec) : undefined;
  }
  const stale = staleShots(shots, scene, look, made);
  const keptKeys = shots.filter((s) => s.kept && !stale.includes(s.key)).map((s) => s.key);
  const refChoices = (s: Shot) => [
    ...(!s.insert && scene.kept ? [{ role: 'anchor-scene' as const, ref: SCENE.key, label: 'the scene', locked: true }] : []),
    ...(lookSheet && (!s.insert || s.characterIds.length) ? [{ role: 'anchor-look' as const, ref: lookSheet.id, label: `his look (${lookSheet.title})`, locked: !s.insert }] : []),
    ...keptKeys.filter((k) => k !== s.key && !s.insert).map((k) => ({ role: (k === shots.slice(0, shots.indexOf(s)).reverse().find((x) => !x.insert && keptKeys.includes(x.key))?.key ? 'continuity' : 'other') as GuideRef['role'], ref: k, label: `shot ${shots.findIndex((x) => x.key === k) + 1} as kept`, locked: false })),
  ];
  // Fix 3: about how long a picture takes, from the continuity test's measured times (FLUX 3–7 s, Gemini 12–18 s, GPT
  // Image 39–60 s); a stand-in card is at once.
  const about = (): string => (!ok.making.real ? 'a moment' : /gpt/i.test(m.chosen?.id ?? ok.making.defaultModel ?? '') ? 'about 40 seconds' : /gemini/i.test(m.chosen?.id ?? '') ? 'about 15 seconds' : 'about 10 seconds');
  const makeButton = (key: string, label: string, disabled: boolean, onClick: () => void) => {
    const madeHere = (tries[key] ?? []).length > 0;
    const working = busy === `make-${key}`;
    return (
      <>
        <button type="button" className="vg-choice vg-primary" disabled={disabled || busy !== null} onClick={onClick}>
          {working ? 'Making…' : madeHere ? 'Try again' : 'Make it'}
        </button>
        {working && <p className="vr-small vg-progress" role="status">Making {label}… {about()}</p>}
        {failed?.key === key && <p className="vr-warn" role="alert">{failed.text}</p>}
      </>
    );
  };
  // Fix 4: what the box is for at each step, with examples to tap.
  const askStep: GuideStep = stage === 'setting' || stage === 'scene' ? 'setting' : stage === 'clothing' ? 'clothing' : stage === 'plan' ? 'plan' : shot && (lastGuide('shot', shot.key) || shot.kept) ? 'fix' : 'shot';
  const examples: Record<GuideStep, string[]> = {
    setting: ['a lecture hall at dawn, cold blue light', 'a broadcast studio, one lamp, late at night'],
    clothing: ['a dark sweater, no coat', 'a grey suit, collar open'],
    plan: ['plan it', 'start wide, then closer and closer'],
    shot: ['a close-up on his hands', 'seen from the back of the room'],
    fix: ['make him lean in', 'warmer light'],
  };
  const askFor: Record<GuideStep, string> = {
    setting: 'Tell the guide where he speaks from, the light and the mood; it drafts the scene.',
    clothing: 'Tell the guide what he wears in this scene; it drafts the words.',
    plan: 'Tell the guide how the shots should go; it drafts a plan of shots and cameras.',
    shot: 'Tell the guide what this shot shows; it drafts the prompt and picks the reference pictures.',
    fix: 'Tell the guide what to change in this shot; it drafts a new prompt.',
  };
  // The guide's question for this step, as its turn in the conversation (fix 5).
  const question = stage === 'clothing' ? 'Which of his looks, and what does he wear in this scene?' : stage === 'scene' ? 'Here is the scene in words. Make its picture: every shot is filmed in it.' : stage === 'plan' ? 'How should the shots go? Ask, or say “plan it”.' : stage === 'shots' && shot ? `Shot ${current + 1} of ${shots.length}: what should it show?` : null;

  return (
    <main className="vr vg">
      <p className="vr-kicker">The Ephelion challenge · Storyboard · Draft</p>
      <h1>{ok.draft.speech?.title ?? 'Storyboard'}</h1>
      <p className="vr-small">
        <span className="vr-tag">{speechLabel}</span> A conversation with the guide: it drafts, you choose. Nothing is made until you press Make it. ·{' '}
        <Link href={`/storyboard/board/${ok.draft.id}`}>I&rsquo;ll write it myself</Link>
      </p>
      <ol className="vg-steps" aria-label="Where you are">
        {(['setting', 'clothing', 'scene', 'plan', 'shots'] as const).map((x, i) => (
          <li key={x} className={x === stage ? 'vg-now' : ['setting', 'clothing', 'scene', 'plan', 'shots'].indexOf(stage) > i ? 'vg-done' : ''}>
            {['Scene', 'Clothing', 'Scene picture', 'Plan', 'Shots'][i]}
          </li>
        ))}
      </ol>
      <VoiceAllowance allowance={allowance} />
      {message && <p className="vr-warn" role="alert">{message}</p>}
      {consent && (
        <ConsentScreen
          wording={consent}
          name={auth.kind === 'signed-in' ? (auth.username ?? null) : null}
          onAgree={async () => {
            const r = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent.sha256 }) });
            if (r.ok) {
              setConsent(null);
              setMessage('Agreed. Press Make it again.');
            } else setMessage('Your agreement could not be recorded. Try again.');
          }}
          onCancel={() => setConsent(null)}
          error={null}
        />
      )}

      {/* The conversation (fix 5): the guide asks, the person answers, and the choices are cards inside the guide's turn.
          Every message stays, the person's word for word, the guide's with its model; the finished steps fold under
          "Earlier", so on a phone the current turn sits near the top. */}
      <section className="vg-dialogue" aria-label="Your conversation with the guide">
        {(() => {
          const groupOf = (step: GuideStep) => (step === 'shot' || step === 'fix' ? 'shots' : step);
          // A person's message belongs to the shot of the guide's reply after it.
          const keyOf = (i: number): string | undefined => {
            for (let j = i; j < msgs.length; j++) if (msgs[j].role === 'guide') return (msgs[j].draft as { shotKey?: string } | null)?.shotKey;
            return undefined;
          };
          const isNow = (i: number) => (groupOf(msgs[i].step) === stage || (stage === 'scene' && msgs[i].step === 'setting' && msgs[i].n > (msgs.find((x) => x.id === scene.settingFrom)?.n ?? Infinity))) && (stage !== 'shots' || keyOf(i) === shot?.key);
          const earlier = msgs.filter((_, i) => !isNow(i));
          const now = msgs.filter((_, i) => isNow(i));
          const intro = (
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
          );
          const renderMsg = (x: GuideMessage) => (
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
          );
          return (
            <>
              {stage === 'setting' && intro}
              {(stage !== 'setting' || earlier.length > 0) && (
                <details className="vg-earlier">
                  <summary>Earlier in your conversation ({earlier.length + (stage === 'setting' ? 0 : 1)} messages)</summary>
                  {stage !== 'setting' && intro}
                  {earlier.map(renderMsg)}
                </details>
              )}
              {now.map(renderMsg)}
            </>
          );
        })()}

        {/* The guide's turn now: its question and the choices, as cards. */}
        <div className="vg-msg vg-guide vg-turn" aria-labelledby="vg-step-h">
          <p className="vg-by" id="vg-step-h">Guide · {['setting', 'scene'].includes(stage) ? '1. The scene' : stage === 'clothing' ? '2. His clothing' : stage === 'plan' ? '3. The shot plan' : `4. Shot ${current + 1} of ${shots.length}${shot?.insert ? ' · Insert, outside the scene' : shot ? ` · ${angleById(shot.angle)?.label ?? ''}` : ''}`}</p>
          {question && <p>{question}</p>}

          {/* A setting or clothing draft, wherever it was asked for (the scene step asks for a new setting). */}
          {edit && (edit.step === 'setting' || edit.step === 'clothing') && (
            <div className="vg-cardbox">
              <PublishedTextField id={`vg-${edit.step}`} label={edit.step === 'setting' ? 'The setting (the guide’s draft; edit it if you like)' : 'What he wears (the guide’s draft; edit it if you like)'} value={edit.text} onChange={(v) => setEdit({ ...edit, text: v })} rows={3} maxLength={edit.step === 'setting' ? 600 : 400} />
              <button type="button" className="vg-choice vg-primary" disabled={busy !== null || !edit.text.trim() || (edit.step === 'clothing' && !look)} onClick={() => save({ scene: edit.step === 'setting' ? { ...scene, setting: edit.text, settingFrom: edit.id } : { ...scene, clothing: edit.text, clothingFrom: edit.id } }).then(() => setEdit(null))}>
                {edit.step === 'setting' ? 'Use this setting' : 'Use these clothes'}
              </button>
            </div>
          )}

          {stage === 'clothing' && (
            <>
              <div className="vb-look-row" role="group" aria-label="His look">
                {looks.map((c) => (
                  <button key={c.id} type="button" className={`vb-look vg-choice${look === c.id ? ' vb-on' : ''}`} aria-pressed={look === c.id} onClick={() => setLook(c.id)}>
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
            </>
          )}

          {stage === 'scene' && (
            <>
              <p className="vg-draft">{sceneWords(scene)}</p>
              <p className="vr-small">A wide shot at eye level, with his look as its one reference. Every shot in the scene is made with it.</p>
              {m.notice}
              {makeButton(SCENE.key, 'the scene', (triesMade[SCENE.key] ?? 0) >= ok.making.limits.maxTriesPerShot, () => { const go = () => void makePicture(SCENE.key, sceneWords(scene), scene.settingFrom ? { messageId: scene.settingFrom, clothingId: scene.clothingFrom } : null, 'wide'); if (!m.askFirst(go)) go(); })}
              {triesFor(SCENE.key)}
            </>
          )}

          {stage === 'plan' && (() => {
            const g = lastGuide('plan');
            const plan = g?.draft && 'plan' in g.draft ? g.draft.plan : null;
            return (
              <>
                {scene.kept && <KeptPicture draftId={ok.draft.id} shot={SCENE.key} sha={scene.kept} alt="The scene, as kept" />}
                {plan ? (
                  <button type="button" className="vg-choice vg-primary" disabled={busy !== null} onClick={() => { const b = planToBoard(t, plan, shots); void save({ cuts: b.cuts, shots: b.shots }); }}>
                    Use this plan ({plan.length} shots)
                  </button>
                ) : (
                  <button type="button" className="vg-choice" disabled={busy !== null} onClick={() => void askGuide('plan', 'Plan it for me')}>Plan it for me</button>
                )}
              </>
            );
          })()}

          {stage === 'shots' && shot && (() => {
            const g = lastGuide('fix', shot.key) && (!lastGuide('shot', shot.key) || lastGuide('fix', shot.key)!.n > lastGuide('shot', shot.key)!.n) ? lastGuide('fix', shot.key) : lastGuide('shot', shot.key);
            const working = edit && g && edit.id === g.id ? edit : null;
            const isStale = stale.includes(shot.key);
            const keptSha = isStale ? null : shot.kept;
            return (
              <>
                <blockquote className="vb-words"><span className="vr-tag">{speechLabel}</span> {sentencesIn(t, shot).map((n) => ok.draft.sentences.find((x) => x.n === n)?.text ?? '').join(' ')}</blockquote>
                {isStale && <p className="vr-warn">The picture kept for this shot was made with another look or before this scene, so it isn&rsquo;t used. Make it again.</p>}
                {working && (
                  <div className="vg-cardbox">
                    <PublishedTextField id={`vg-prompt-${shot.key}`} label="The prompt (the guide’s draft; edit it if you like)" value={working.text} onChange={(v) => setEdit({ ...working, text: v })} rows={4} maxLength={600} />
                    <fieldset className="vg-refs"><legend className="vb-label">Reference pictures (at most 3; the scene and his look always)</legend>
                      {refChoices(shot).map((c) => {
                        const on = c.locked || working.refs.some((r) => r.ref === c.ref);
                        const why = c.locked ? 'every shot in the scene uses it' : working.refs.find((r) => r.ref === c.ref)?.why;
                        return (
                          <label key={c.ref} className="vb-toggle">
                            <input type="checkbox" checked={on} disabled={c.locked || (!on && working.refs.length >= 3)} onChange={() => setEdit({ ...working, refs: on ? working.refs.filter((r) => r.ref !== c.ref) : [...working.refs, { role: c.role, ref: c.ref, why: 'chosen by you' }] })} />
                            {c.label}{why ? <span className="vr-small"> · {why}</span> : null}
                          </label>
                        );
                      })}
                    </fieldset>
                    {m.notice}
                    {makeButton(shot.key, `shot ${current + 1}`, !working.text.trim() || (triesMade[shot.key] ?? 0) >= ok.making.limits.maxTriesPerShot, async () => {
                      const next = shots.map((s) => (s.key === shot.key ? { ...s, description: working.text, guideFrom: working.id } : s));
                      if (!(await save({ shots: next }))) return;
                      const go = () => void makePicture(shot.key, working.text, { messageId: working.id, references: working.refs.map((r) => ({ role: r.role, ref: r.ref })) }, shot.angle);
                      if (!m.askFirst(go)) go();
                    })}
                  </div>
                )}
                {g && !working && <button type="button" className="vg-choice" onClick={() => { const dd = g.draft as { prompt: string; references: GuideRef[] }; setEdit({ id: g.id, step: g.step, text: dd.prompt, refs: dd.references }); }}>Use the guide&rsquo;s last draft</button>}
                {triesFor(shot.key)}
                {keptSha && !(tries[shot.key] ?? []).some((tr) => tr.sha256 === keptSha) && <KeptPicture draftId={ok.draft.id} shot={shot.key} sha={keptSha} alt={`Shot ${current + 1}, as kept`} />}
                <div className="vr-row">
                  <button type="button" className="vg-choice" disabled={current === 0} onClick={() => { setCurrent(current - 1); setEdit(null); setFailed(null); }}>Previous shot</button>
                  <button type="button" className="vg-choice" disabled={current === shots.length - 1} onClick={() => { setCurrent(current + 1); setEdit(null); setFailed(null); }}>Next shot</button>
                </div>
                {shots.every((s) => keptKeys.includes(s.key) || (s.insert && s.kept)) && <p className="vr-ok">Every shot has a picture. <Link href={`/storyboard/board/${ok.draft.id}`}>Open the storyboard</Link> for the closing card, the play-through and publishing.</p>}
              </>
            );
          })()}
        </div>
      </section>

      {/* Ask the guide, in your own words (fix 4): it works at every step, says what it's for, and offers examples. The
          request is kept word for word with what it drafts. */}
      <form
        className="vg-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void askGuide(askStep, ask, askStep === 'shot' || askStep === 'fix' ? shot?.key : undefined);
        }}
      >
        <p className="vr-small vg-askfor">{askFor[askStep]}</p>
        <div className="vg-examples" aria-label="Examples">
          {examples[askStep].map((x) => (
            <button key={x} type="button" className="vg-example" onClick={() => setAsk(x)}>
              &ldquo;{x}&rdquo;
            </button>
          ))}
        </div>
        <PublishedTextField id="vg-ask" label="Ask the guide, in your own words" value={ask} onChange={setAsk} rows={2} maxLength={1000} placeholder={`e.g. “${examples[askStep][0]}”`} />
        <button type="submit" className="vr-btn" disabled={!ask.trim() || busy !== null}>{busy === 'guide' ? 'The guide is writing…' : 'Send'}</button>
        <p className="vr-small">Your words are kept with the storyboard, and published with each picture they asked for if you publish it. The guide runs on {model}{/stand-in/.test(model) ? '' : ' (an open model, on the assistant’s provider)'}; it never writes the speech&rsquo;s words.</p>
      </form>
    </main>
  );
}
