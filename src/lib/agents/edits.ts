import 'server-only';
import { ToolInputError } from '../agent/tools';
import { editorData, type DataShot } from '../agent/data';
import { getVersion } from '../adaptation-pages';
import { AGENTS, REMIX } from '../config';
import { remixPictures } from '../remix/make';
import { remixShot, type RemixPicture } from '../remix/shot';
import { priceUsd } from '../wallet/credits';
import { sql, type Agent } from './core';
import { draftPiece } from './pieces';

/**
 * Editing your own adaptation through your agent (owner, 2026-10-20: "edit Fifteen Days myself through agents
 * on my phone"). Every edit is a draft for its person, on a version they made:
 * - frame: try a new frame for a shot, from the person's note;
 * - take: swap a line's voice take for another take of the same line;
 * - timing: change a shot's start and end;
 * - speaking: mark who is speaking in a shot;
 * - video: a short video test of a shot.
 * A frame or a video costs money, so it is only an estimate until the person approves it on /you; then our
 * server makes it (Remix's own pipeline for a frame; LongCat-Video 480p on fal for a video), within daily
 * caps, and keeps the result private in the draft. Nothing is applied to the published scene: a kept edit
 * is the person's decision, and putting kept edits into a new version of the scene is the next step.
 */
export type Change =
  | { type: 'frame'; note: string; estimate_usd: number; /** A wallet account's exact charge (Terms 6a: "the price shown"), shown on Make it. */ price_usd?: number }
  | { type: 'take'; cue: string; line: string; from: string | null; to: string }
  | { type: 'timing'; from_s: number; to_s: number; was: { from_s: number; to_s: number } }
  | { type: 'speaking'; who: string[]; was: string[] }
  | { type: 'video'; note: string; model: string; seconds: number; estimate_usd: number };

const posInt = (v: unknown, what: string) => {
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new ToolInputError(`${what} must be a whole number from 1`);
  return n;
};

/** The shot, on a version the agent's person made. */
async function ownShot(agent: Agent, args: Record<string, unknown>): Promise<{ adaptation: number; version: number; shot: DataShot }> {
  const adaptation = posInt(args.adaptation, 'adaptation');
  const version = posInt(args.version, 'version');
  const v = await getVersion(version);
  if (!v || v.adaptationId !== adaptation || v.hidden || v.author !== agent.person) throw new ToolInputError('You can edit only your person’s own versions (see list_scenes for theirs).');
  const d = editorData(adaptation, version);
  const shot = d?.shots.find((s) => s.id === args.shot);
  if (!shot) throw new ToolInputError(`no shot "${String(args.shot)}" in that version (see get_scene)`);
  return { adaptation, version, shot };
}

const note = (v: unknown, what = 'note') => {
  if (typeof v !== 'string' || !v.trim() || v.length > 1000) throw new ToolInputError(`${what}: your person's words, 1 to 1,000 characters`);
  return v.trim();
};

export const frameEstimate = () => Math.round(REMIX.reserveUsd(REMIX.maxPictures) * 100) / 100;
/**
 * What a wallet account is charged for this shot's frame: the Remix price for the pictures the shot sends (its camera,
 * cast cards and plate), exactly as generate() debits it (src/lib/remix/make.ts). Null if the shot can't be redrawn.
 */
export function framePrice(adaptation: number, version: number, shotId: string): number | null {
  const shot = remixShot(adaptation, version, shotId);
  if (!shot?.prompt) return null;
  return priceUsd(REMIX.reserveUsd(remixPictures({ role: 'layout' } as RemixPicture, shot).length));
}
export const videoEstimate = () => Math.round(AGENTS.spend.videoUsdPerSecond * AGENTS.spend.videoSeconds * 1000) / 1000;

async function draftEdit(agent: Agent, adaptation: number, version: number, shot: DataShot, change: Change, title: string, answering?: unknown) {
  const body = { adaptation, version, shot: shot.id, change };
  const out = await draftPiece(agent, 'edit', title, adaptation, body, false, undefined, typeof answering === 'string' ? { request: answering } : {});
  return { ...out, status: 'draft', change, next: change.type === 'frame' || change.type === 'video' ? `Waiting for your person to approve about $${change.estimate_usd} on their You page; nothing is spent before.` : 'Waiting for your person to keep it.' };
}

export async function tryFrame(agent: Agent, args: Record<string, unknown>) {
  const { adaptation, version, shot } = await ownShot(agent, args);
  const n = note(args.note);
  if (!remixShot(adaptation, version, shot.id)?.prompt) throw new ToolInputError('this shot has no prompt and camera to redraw from');
  const price = agent.person < 0 ? framePrice(adaptation, version, shot.id) : null;
  return draftEdit(agent, adaptation, version, shot, { type: 'frame', note: n, estimate_usd: frameEstimate(), ...(price !== null ? { price_usd: price } : {}) }, `Shot ${shot.n}: a new frame`, args.answering);
}

export async function swapTake(agent: Agent, args: Record<string, unknown>) {
  const { adaptation, version, shot } = await ownShot(agent, args);
  const lines = (shot.lines ?? []) as { cue: string; text?: string; voice?: { name?: string }; takes?: { id: string }[] }[];
  const line = lines.find((l) => l.cue === args.cue);
  if (!line) throw new ToolInputError(`no line "${String(args.cue)}" in this shot; its lines are ${lines.map((l) => l.cue).join(', ') || 'none'}`);
  const take = (line.takes ?? []).find((t) => t.id === args.take);
  if (!take) throw new ToolInputError(`no take "${String(args.take)}" for line ${line.cue}; its takes are ${(line.takes ?? []).map((t) => t.id).join(', ')}`);
  return draftEdit(agent, adaptation, version, shot, { type: 'take', cue: line.cue, line: line.text ?? '', from: line.voice?.name ?? null, to: take.id }, `Shot ${shot.n}: another take of ${line.cue}`, args.answering);
}

export async function changeTiming(agent: Agent, args: Record<string, unknown>) {
  const { adaptation, version, shot } = await ownShot(agent, args);
  const from = args.from_s === undefined ? shot.from : Number(args.from_s);
  const to = args.to_s === undefined ? (args.seconds === undefined ? shot.to : from + Number(args.seconds)) : Number(args.to_s);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to - from < 0.3 || to - from > 30) throw new ToolInputError('a shot runs from 0.3 to 30 seconds; give from_s and to_s, or seconds');
  return draftEdit(agent, adaptation, version, shot, { type: 'timing', from_s: Math.round(from * 100) / 100, to_s: Math.round(to * 100) / 100, was: { from_s: shot.from, to_s: shot.to } }, `Shot ${shot.n}: new timing`, args.answering);
}

export async function markSpeaking(agent: Agent, args: Record<string, unknown>) {
  const { adaptation, version, shot } = await ownShot(agent, args);
  const who = Array.isArray(args.who) ? args.who.filter((w): w is string => typeof w === 'string' && /^[\p{L} .'-]{1,30}$/u.test(w)).slice(0, 6) : [];
  if (!who.length) throw new ToolInputError('who: the names (or the shot\'s letters, e.g. Z, B) of whoever speaks in this shot');
  return draftEdit(agent, adaptation, version, shot, { type: 'speaking', who, was: Array.isArray(shot.who) ? (shot.who as string[]) : [] }, `Shot ${shot.n}: who's speaking`, args.answering);
}

export async function requestVideo(agent: Agent, args: Record<string, unknown>) {
  const { adaptation, version, shot } = await ownShot(agent, args);
  if (typeof shot.frame !== 'string') throw new ToolInputError('this shot has no frame to move');
  return draftEdit(agent, adaptation, version, shot, { type: 'video', note: note(args.note ?? 'A subtle, natural movement; the camera holds.', 'note'), model: AGENTS.spend.videoModel, seconds: AGENTS.spend.videoSeconds, estimate_usd: videoEstimate() }, `Shot ${shot.n}: a video test`, args.answering);
}

export async function logGap(agent: Agent, args: Record<string, unknown>) {
  const asked = note(args.asked, 'asked');
  const missing = note(args.missing, 'missing');
  const [g] = await sql()<{ id: string }[]>`insert into studio.agent_gaps (person, agent_id, agent_name, asked, missing) values (${agent.person}, ${agent.id}, ${agent.name}, ${asked}, ${missing}) returning id`;
  return { gap: g.id, shown: 'on your person\'s You page, under "What your agent couldn\'t do"' };
}

export async function gapsOf(person: number) {
  const rows = await sql()<{ id: string; agent_name: string; asked: string; missing: string; created_at: Date }[]>`
    select id, agent_name, asked, missing, created_at from studio.agent_gaps where person = ${person} order by created_at desc limit 50`;
  return rows.map((r) => ({ id: r.id, agent: r.agent_name, asked: r.asked, missing: r.missing, createdAt: new Date(r.created_at).toISOString() }));
}

/** Every line of a shot and the takes there are for it (read). */
export async function listTakes(agent: Agent, args: Record<string, unknown>) {
  const { shot } = await ownShot(agent, args);
  return {
    shot: shot.id,
    lines: ((shot.lines ?? []) as { cue: string; speaker?: string; text?: string; voice?: { name?: string }; takes?: { id: string; inVersion?: boolean }[] }[]).map((l) => ({
      cue: l.cue, speaker: l.speaker ?? null, text: l.text ?? '', in_use: l.voice?.name ?? null, takes: (l.takes ?? []).map((t) => t.id),
    })),
  };
}

