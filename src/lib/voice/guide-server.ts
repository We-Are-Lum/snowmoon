import 'server-only';
import type postgres from 'postgres';
import { CHAT } from '../config';
import { voiceTestOn } from './flag';
import { boardLook, coverageAngles, madeWithOf, sceneWords, sentencesIn, staleShots, type Shot } from './board';
import { boardSource, keptPictures, latestBoard } from './board-store';
import { speechById } from './speech';
import { isImprovised, spokenSentences, type Spoken } from './spoken';
import { GUIDE, GUIDE_STEPS, readGuideReply, type DraftContext, type GuideDraft, type GuideMessage, type GuideStep } from './guide';

/**
 * The guide's server side (Nate, 2026-11-22/23): each turn keeps the person's message word for word, asks the guide on the
 * assistant's own model and provider (CHAT: nothing goes to a new service), checks its reply (readGuideReply: the shape,
 * the references, and never the speech's words), retries once with what was wrong, and keeps the guide's message with
 * its draft, model and cost. On a local test copy (VOICE_TEST_ON) a stand-in guide answers instead: no model is called.
 *
 * What the guide receives: the person's message and the recent dialogue, the speech's sentences (numbered; already
 * public), the board's choices (shots by sentence number, cameras, inserts, the scene's setting and clothing), the chosen
 * look's sheet text, and the kept pictures by key. Never a recording, audio or a picture.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };
export interface Reply { text: string; costUsd: number; model: string }
export interface GuideDeps {
  ask: (system: string, user: string) => Promise<Reply>;
  system: () => string;
}

export async function guideMessages(sql: Sql, draftId: string, fid: number): Promise<GuideMessage[]> {
  const rows = await sql`select id, n, role, step, text, draft, model, made_at from studio.voice_guide_messages where draft_id = ${draftId} and fid = ${fid} order by n`;
  return rows.map((r) => ({ id: r.id as string, n: r.n as number, role: r.role as GuideMessage['role'], step: r.step as GuideStep, text: r.text as string, draft: (r.draft as GuideDraft | null) ?? null, model: (r.model as string | null) ?? null, madeAt: new Date(r.made_at as string).toISOString() }));
}

/** One guide message by id, with the person's request it answers (the person's message just before it). */
export async function guideDraftById(sql: Sql, draftId: string, fid: number, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const all = await guideMessages(sql, draftId, fid);
  const g = all.find((m) => m.id === id && m.role === 'guide');
  if (!g) return null;
  const request = [...all].reverse().find((m) => m.role === 'person' && m.n < g.n) ?? null;
  return { guide: g, request };
}

export async function askGuide(sql: Sql, fid: number, raw: unknown, deps: GuideDeps): Promise<Result> {
  const b = (raw ?? {}) as { draftId?: unknown; step?: unknown; text?: unknown; shotKey?: unknown; look?: unknown };
  const draft = await boardSource(sql, fid, String(b.draftId ?? ''));
  if (!draft || !draft.timeline) return { status: 404, json: { error: 'Not found' } };
  const step = String(b.step ?? '') as GuideStep;
  if (!GUIDE_STEPS.includes(step)) return { status: 400, json: { error: 'No such step' } };
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text) return { status: 400, json: { error: 'Write what you want, in your own words.' } };
  if (text.length > GUIDE.maxMessageChars) return { status: 400, json: { error: `At most ${GUIDE.maxMessageChars} characters.` } };
  const speech = draft.recipe.speech ? speechById(draft.recipe.speech.id) : null;
  if (!speech) return { status: 400, json: { error: 'No such speech' } };
  const board = await latestBoard(sql, draft.id, fid);
  const shots: Shot[] = board?.shots ?? [];
  if ((step === 'shot' || step === 'fix') && !shots.some((s) => s.key === b.shotKey)) return { status: 400, json: { error: 'Plan the shots first: that shot is not on the saved storyboard.' } };
  const had = await guideMessages(sql, draft.id, fid);
  if (had.length + 2 > GUIDE.maxMessagesPerBoard) return { status: 429, json: { error: `This storyboard's dialogue is full (${GUIDE.maxMessagesPerBoard} messages).` } };
  const kept = await keptPictures(sql, draft.id, fid);
  // A kept shot made with another scene or look isn't offered (staleShots, Nate 2026-11-24).
  const made = Object.fromEntries(shots.map((s) => { const p = s.kept ? kept.find((x) => x.shotKey === s.key && x.sha256 === s.kept) : undefined; return [s.key, p ? madeWithOf(p.recipe) : undefined]; }));
  const stale = staleShots(shots, board?.scene ?? null, boardLook(shots), made);
  const keptShots = shots.filter((s) => s.kept && !stale.includes(s.key) && kept.some((p) => p.shotKey === s.key && p.sha256 === s.kept)).map((s) => s.key);
  const look = typeof b.look === 'object' && b.look ? (b.look as { id?: string; title?: string; text?: string }) : null;
  const c: DraftContext = {
    timeline: draft.timeline,
    // The spoken words (Nate, 2026-11-24): the speech's sentences for a word-for-word take, the person's transcribed
    // (and corrected) words for an improvised one. The guide never writes either into a picture's words.
    sentences: spokenSentences(draft.recipe as { spoken?: Spoken; speech?: { id?: string } }),
    otherWords: isImprovised(draft.recipe as { spoken?: Spoken }) ? speech.sentences.map((s) => ({ n: s.n, text: s.text })) : [],
    shots,
    refs: { scene: Boolean(board?.scene?.kept), looks: look?.id ? [look.id] : [], keptShots },
    maxShots: 12,
  };
  const n = (had.at(-1)?.n ?? 0) + 1;
  const [person] = await sql`insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (${draft.id}, ${fid}, ${n}, 'person', ${step}, ${text}) returning id, made_at`;
  // What the guide receives (text only; see above).
  const user = JSON.stringify({
    step,
    request: text,
    shotKey: typeof b.shotKey === 'string' ? b.shotKey : null,
    speech: { title: speech.title, label: speech.label.text, sentences: c.sentences, ...(isImprovised(draft.recipe as { spoken?: Spoken }) ? { improvised: true, note: "The sentences are the performer's own words, improvised on this speech's theme, as transcribed." } : {}) },
    shotsAllowed: c.maxShots,
    defaultCameras: coverageAngles(shots),
    board: {
      scene: board?.scene ? { setting: board.scene.setting, clothing: board.scene.clothing ?? null, kept: Boolean(board.scene.kept) } : null,
      shots: shots.map((s) => ({ key: s.key, sentences: sentencesIn(draft.timeline!, s), camera: s.angle, insert: s.insert === true, prompt: s.description || null, kept: keptShots.includes(s.key) })),
    },
    look: look ? { id: look.id, title: look.title, sheet: look.text } : null,
    keptPictures: [...(c.refs.scene ? ['scene'] : []), ...keptShots],
    dialogue: had.slice(-10).map((m) => ({ who: m.role, step: m.step, text: m.text, draft: m.draft })),
  });
  let reply: Reply;
  let read: ReturnType<typeof readGuideReply>;
  let cost = 0;
  try {
    reply = await deps.ask(deps.system(), user);
    cost += reply.costUsd;
    read = readGuideReply(step, reply.text, c, typeof b.shotKey === 'string' ? b.shotKey : null);
    if ('error' in read) {
      reply = await deps.ask(deps.system(), `${user}\n\nYour last reply was refused: ${read.error}. Reply again, keeping every rule.`);
      cost += reply.costUsd;
      read = readGuideReply(step, reply.text, c, typeof b.shotKey === 'string' ? b.shotKey : null);
    }
  } catch {
    return { status: 503, json: { error: 'The guide did not answer. Try again in a moment, or write it yourself.', person: { id: person.id, n } } };
  }
  if ('error' in read) return { status: 422, json: { error: `The guide's draft didn't keep the rules (${read.error}). Ask again in other words, or write it yourself.`, person: { id: person.id, n } } };
  const [g] = await sql`insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text, draft, model, cost_usd)
    values (${draft.id}, ${fid}, ${n + 1}, 'guide', ${step}, ${read.say}, ${sql.json(read.draft as unknown as postgres.JSONValue)}, ${reply!.model}, ${Math.round(cost * 1e6) / 1e6}) returning id, made_at`;
  return { status: 200, json: { person: { id: person.id, n, text }, guide: { id: g.id, n: n + 1, say: read.say, draft: read.draft, model: reply!.model, costUsd: cost } } };
}

/** The guide's deps: the assistant's model on its provider, or, on a local test copy, the stand-in guide. */
export async function guideDeps(request: Request): Promise<GuideDeps> {
  const { promptFile } = await import('../chat/model');
  if (voiceTestOn()) return { system: () => promptFile('storyboard-guide.md'), ask: async (_s, user) => standInGuide(user) };
  const { complete, gatewayToken } = await import('../chat/model');
  return {
    system: () => promptFile('storyboard-guide.md'),
    ask: async (system, user) => {
      const r = await complete(gatewayToken(request), CHAT.model, [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: GUIDE.maxTokens, temperature: 0.4 });
      return { text: r.text, costUsd: r.costUsd, model: r.model };
    },
  };
}

/**
 * The stand-in guide (local test copies only: tests and screenshots; no model). It answers each step in the right shape
 * from the person's words and the board, so the flow can be walked through; its words are marked as the stand-in's.
 */
export function standInGuide(user: string): Reply {
  // A retry appends what was refused after the request's JSON: the stand-in reads the JSON only.
  const u = JSON.parse(user.split('\n\nYour last reply was refused')[0]) as { step: GuideStep; request: string; shotKey: string | null; shotsAllowed: number; speech: { sentences: { n: number }[] }; board: { shots: { key: string; insert: boolean; kept: boolean; prompt: string | null }[]; scene: { kept: boolean } | null }; look: { id: string } | null };
  const said = u.request.replace(/\s+/g, ' ').slice(0, 300);
  const model = 'stand-in guide (no model)';
  if (u.step === 'setting') return { model, costUsd: 0, text: JSON.stringify({ say: '(stand-in) A setting from your words.', draft: { setting: `(stand-in guide) ${said}` } }) };
  if (u.step === 'clothing') return { model, costUsd: 0, text: JSON.stringify({ say: '(stand-in) His clothing, from your words.', draft: { clothing: `(stand-in guide) ${said}` } }) };
  if (u.step === 'plan') {
    const ns = u.speech.sentences.map((s) => s.n);
    const size = Math.max(1, Math.ceil(ns.length / Math.min(6, u.shotsAllowed)));
    const groups: number[][] = [];
    for (let i = 0; i < ns.length; i += size) groups.push(ns.slice(i, i + size));
    const cams = ['wide', 'medium', 'close', 'left', 'close', 'low'];
    const plan = groups.map((g, i) => ({ sentences: g, camera: i === groups.length - 1 ? 'wide' : cams[i % cams.length], insert: false, why: '(stand-in) the default coverage' }));
    return { model, costUsd: 0, text: JSON.stringify({ say: `(stand-in) ${plan.length} shots, from the speech's sentences.`, draft: { plan } }) };
  }
  const shots = u.board.shots;
  const i = shots.findIndex((s) => s.key === u.shotKey);
  const shot = shots[i];
  const prev = shots.slice(0, i).reverse().find((s) => !s.insert && s.kept);
  const refs = shot?.insert
    ? u.look ? [{ role: 'anchor-look', ref: u.look.id, why: '(stand-in) a character is in it' }] : []
    : [
        ...(u.board.scene?.kept ? [{ role: 'anchor-scene', ref: 'scene', why: '(stand-in) the place and the light' }] : []),
        ...(u.look ? [{ role: 'anchor-look', ref: u.look.id, why: '(stand-in) him and his clothes' }] : []),
        ...(prev ? [{ role: 'continuity', ref: prev.key, why: '(stand-in) the shot before' }] : []),
      ];
  const base = u.step === 'fix' && shot?.prompt ? `${shot.prompt} ${said}` : `(stand-in guide) Shot ${i + 1}: ${said}`;
  return { model, costUsd: 0, text: JSON.stringify({ say: u.step === 'fix' ? '(stand-in) Changed as you asked.' : `(stand-in) A prompt for shot ${i + 1}.`, draft: { shotKey: u.shotKey, prompt: base.slice(0, 600), references: refs } }) };
}

export { sceneWords };
