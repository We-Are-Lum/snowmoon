/**
 * The storyboard guide (Nate, 2026-11-22/23; docs/proposals/storyboard-scene.md v3; P2's "Storyboard pictures" ruling):
 * a dialogue in which the person asks in their own words and the guide drafts each step: the setting, his clothing, the
 * shot plan (from the speech's numbered sentences), each shot's prompt and reference pictures, and fixes. The person
 * approves or edits every draft; nothing is made until they press Make. Pure: the server, the page and the tests share it.
 *
 * The guide never writes the speech's words: its drafts carry sentence numbers, never sentences, and every draft is
 * checked for runs of the speech's words before it is shown (speechWordsIn).
 */
import { angleById, planProblems, type PlanShot, type Shot, type Timeline } from './board';

// 'timing' (Nate, 2026-11-24, three ways in): on a storyboard fitted to a new voice, the guide only proposes making one
// shot longer or shorter ("make shot 3 longer"); the person accepts it, and the site moves the cut (nudgeShot).
export type GuideStep = 'setting' | 'clothing' | 'plan' | 'shot' | 'fix' | 'timing';
export const GUIDE_STEPS: readonly GuideStep[] = ['setting', 'clothing', 'plan', 'shot', 'fix', 'timing'];

export interface GuideRef {
  role: 'anchor-scene' | 'anchor-look' | 'continuity' | 'other';
  /** 'scene', a look's version id, or a shot key of this board. */
  ref: string;
  why: string;
}
export type GuideDraft =
  | { setting: string }
  | { clothing: string }
  | { plan: PlanShot[] }
  | { shotKey: string; prompt: string; references: GuideRef[] }
  | { timing: { shot: number; change: 'longer' | 'shorter'; seconds: number } };

export interface GuideMessage {
  id: string;
  n: number;
  role: 'person' | 'guide';
  step: GuideStep;
  text: string;
  draft: GuideDraft | null;
  model: string | null;
  madeAt: string;
}

export const GUIDE = {
  /** The assistant's model and provider (CHAT): nothing goes to a new service. */
  maxMessagesPerBoard: 120,
  maxMessageChars: 1000,
  maxDraftChars: 900,
  maxTokens: 1600,
  /** A run of this many of the speech's words in a draft is refused (the guide never writes the speech's words). */
  speechRun: 6,
} as const;

const words = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

/** The first run of `run` consecutive words of the speech found in a text, or null. */
export function speechWordsIn(text: string, sentences: { text: string }[], run: number = GUIDE.speechRun): string | null {
  const t = ` ${words(text).join(' ')} `;
  for (const s of sentences) {
    const w = words(s.text);
    for (let i = 0; i + run <= w.length; i++) {
      const piece = w.slice(i, i + run).join(' ');
      if (t.includes(` ${piece} `)) return piece;
    }
  }
  return null;
}

/** Every string in a draft (to check them all for the speech's words and their length). */
const stringsOf = (x: unknown): string[] => (typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(stringsOf) : x && typeof x === 'object' ? Object.values(x).flatMap(stringsOf) : []);

export interface DraftContext {
  timeline: Timeline;
  sentences: { n: number; text: string }[];
  /** More words the guide may not write (an improvised take's speech, beside the performer's words in `sentences`). */
  otherWords?: { n: number; text: string }[];
  shots: Shot[];
  /** Pictures the guide may choose as references: 'scene', the look ids offered, the kept shots' keys. */
  refs: { scene: boolean; looks: string[]; keptShots: string[] };
  maxShots: number;
}

/** The guide's reply, read and checked: its message to the person and its draft for this step, or what is wrong. */
export function readGuideReply(step: GuideStep, raw: string, c: DraftContext, shotKey?: string | null): { say: string; draft: GuideDraft } | { error: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m ? m[0] : raw);
  } catch {
    return { error: 'the reply was not JSON' };
  }
  const say = typeof j.say === 'string' ? j.say.trim() : '';
  if (!say || say.length > GUIDE.maxDraftChars) return { error: 'the reply needs a short "say" for the person' };
  let d = (j.draft ?? {}) as Record<string, unknown>;
  // A model sometimes nests the draft under its step's name ({"setting": {"setting": "…"}}): read the inner one.
  const inner = d[step === 'fix' ? 'shot' : step];
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) d = inner as Record<string, unknown>;
  let draft: GuideDraft;
  if (step === 'setting') {
    if (typeof d.setting !== 'string' || !d.setting.trim()) return { error: 'the draft needs a "setting"' };
    draft = { setting: d.setting.trim() };
  } else if (step === 'clothing') {
    if (typeof d.clothing !== 'string' || !d.clothing.trim()) return { error: 'the draft needs "clothing"' };
    draft = { clothing: d.clothing.trim() };
  } else if (step === 'plan') {
    const plan = (Array.isArray(d.plan) ? d.plan : []).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { sentences: Array.isArray(o.sentences) ? o.sentences.map(Number).filter((x) => Number.isInteger(x)) : [], camera: (angleById(String(o.camera ?? ''))?.id ?? '') as PlanShot['camera'], insert: o.insert === true, why: typeof o.why === 'string' ? o.why.slice(0, 200) : '' };
    });
    const problems = planProblems(c.timeline, plan, c.maxShots);
    if (problems.length) return { error: `the plan: ${problems.join('; ')}` };
    draft = { plan };
  } else if (step === 'timing') {
    const o = ((d.timing ?? d) as Record<string, unknown>) ?? {};
    const shot = Number(o.shot);
    const change = o.change === 'longer' || o.change === 'shorter' ? o.change : null;
    const seconds = o.seconds === undefined ? 1.5 : Number(o.seconds);
    if (!Number.isInteger(shot) || shot < 1 || shot > c.shots.length) return { error: `the draft names no shot of this board (1 to ${c.shots.length})` };
    if (!change) return { error: 'the draft says "longer" or "shorter"' };
    if (!Number.isFinite(seconds) || seconds < 0.3 || seconds > 10) return { error: 'the change is 0.3 to 10 seconds' };
    draft = { timing: { shot, change, seconds: Math.round(seconds * 10) / 10 } };
  } else {
    const key = shotKey ?? (typeof d.shotKey === 'string' ? d.shotKey : '');
    if (!c.shots.some((s) => s.key === key)) return { error: 'the draft names no shot of this board' };
    if (typeof d.prompt !== 'string' || !d.prompt.trim()) return { error: 'the draft needs a "prompt"' };
    const refs = (Array.isArray(d.references) ? d.references : []).map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { role: String(o.role ?? '') as GuideRef['role'], ref: String(o.ref ?? ''), why: typeof o.why === 'string' ? o.why.slice(0, 200) : '' };
    });
    if (refs.length > 3) return { error: 'at most 3 reference pictures' };
    const shot = c.shots.find((s) => s.key === key)!;
    for (const r of refs) {
      if (!['anchor-scene', 'anchor-look', 'continuity', 'other'].includes(r.role)) return { error: `a reference has no known role (${r.role})` };
      const ok = r.ref === 'scene' ? c.refs.scene : c.refs.looks.includes(r.ref) || (c.refs.keptShots.includes(r.ref) && r.ref !== key);
      if (!ok) return { error: `a reference isn't a picture of this board (${r.ref})` };
      if (!r.why.trim()) return { error: 'each reference needs its "why"' };
    }
    // An insert never takes the scene or a shot of the scene (proposal v2, section 3b).
    if (shot.insert && refs.some((r) => r.ref === 'scene' || r.role === 'continuity')) return { error: 'an insert takes neither the scene nor a previous shot' };
    draft = { shotKey: key, prompt: d.prompt.trim(), references: refs };
  }
  for (const s of [say, ...stringsOf(draft)]) {
    if (s.length > GUIDE.maxDraftChars) return { error: 'a draft is too long' };
    const hit = speechWordsIn(s, [...c.sentences, ...(c.otherWords ?? [])]);
    if (hit) return { error: `a draft repeats the speech's words ("${hit}…"): it must never write them` };
  }
  return { say, draft };
}

/** The guide's part of a picture's recipe (P2's ruling), built only from the stored dialogue and what was sent. */
export interface GuideRecipe {
  guide: { model: string; host: string; open: boolean } | null;
  request: { text: string; messageId: string; at: string } | null;
  prompt: { text: string; by: 'guide' | 'person'; draft: string | null };
  references: { role: GuideRef['role']; ref: string; chosenBy: 'guide' | 'person'; why: string }[];
  edits: { what: 'prompt' | 'references'; before: unknown; after: unknown }[];
}
export function guideRecipe(o: {
  guide: { model: string; host: string; open: boolean } | null;
  request: { text: string; id: string; madeAt: string } | null;
  drafted: { prompt: string; references: GuideRef[] } | null;
  sent: { prompt: string; references: { role: GuideRef['role']; ref: string }[] };
}): GuideRecipe {
  const edits: GuideRecipe['edits'] = [];
  const d = o.drafted;
  if (d && d.prompt !== o.sent.prompt) edits.push({ what: 'prompt', before: d.prompt, after: o.sent.prompt });
  const key = (r: { role: string; ref: string }) => `${r.role}:${r.ref}`;
  if (d && d.references.map(key).join() !== o.sent.references.map(key).join()) edits.push({ what: 'references', before: d.references.map(key), after: o.sent.references.map(key) });
  return {
    guide: d ? o.guide : null,
    request: o.request ? { text: o.request.text, messageId: o.request.id, at: o.request.madeAt } : null,
    prompt: { text: o.sent.prompt, by: d && d.prompt === o.sent.prompt ? 'guide' : 'person', draft: d ? d.prompt : null },
    references: o.sent.references.map((r) => {
      const g = d?.references.find((x) => key(x) === key(r));
      return { role: r.role, ref: r.ref, chosenBy: g ? 'guide' : 'person', why: g?.why ?? 'chosen by the person' };
    }),
    edits,
  };
}

/**
 * What P2u checks on every storyboard picture's recipe: a picture the guide had a hand in keeps the person's request
 * word for word, the guide's model, the prompt as sent and the guide's draft, each reference with who chose it and why,
 * and the person's edits (a prompt that differs from the draft must be recorded as an edit).
 */
export function guideRecipeProblems(r: Partial<GuideRecipe> | null | undefined): string[] {
  if (!r || r.guide === undefined) return ['no guide record'];
  const out: string[] = [];
  if (r.guide === null) return r.prompt?.by === 'person' && !r.prompt.draft ? [] : ['a prompt the guide drafted has no guide record'];
  if (!r.guide.model) out.push("the guide's model is missing");
  if (!r.request || typeof r.request.text !== 'string' || !r.request.text.trim()) out.push("the person's request is missing");
  if (!r.prompt || !r.prompt.text) out.push('the prompt as sent is missing');
  if (r.prompt && r.prompt.draft === undefined) out.push("the guide's draft is missing");
  if (!Array.isArray(r.references) || r.references.some((x) => !x.chosenBy || !x.why)) out.push('a reference has no chooser or reason');
  if (!Array.isArray(r.edits)) out.push('the edits are missing');
  else if (r.prompt && r.prompt.draft !== null && r.prompt.draft !== r.prompt.text && !r.edits.some((e) => e.what === 'prompt')) out.push("the person's edit to the prompt is not recorded");
  return out;
}
