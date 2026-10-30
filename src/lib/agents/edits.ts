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
import { suggestionsReader } from './suggestions';
import { agentLabel } from './accounts';

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
  | { type: 'video'; note: string; model: string; seconds: number; estimate_usd: number }
  | { type: 'camera'; angle_deg: number | null; distance_m: number | null; height_m: number | null; people: { who: string; x: number; z: number; facing_deg: number | null }[] };

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

const num = (v: unknown, what: string, min: number, max: number) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ToolInputError(`${what} must be a number from ${min} to ${max}`);
  return Math.round(v * 100) / 100;
};

/**
 * A camera and staging change for a shot (owner, 2026-10-29, Phase 4): angle (degrees; negative looks up), distance
 * and height (metres), and where people stand on the shot's saved layout. Drafted only: the server refuses a shot that
 * isn't in the person's own version (ownShot) and a person who isn't in the shot. The new layout is drawn by the
 * person's browser on their dashboard, as the editor does, before try_frame makes a frame from it; nothing is spent here.
 */
export async function setCamera(agent: Agent, args: Record<string, unknown>) {
  const { adaptation, version, shot } = await ownShot(agent, args);
  const onScreen = new Set(Array.isArray(shot.who) ? (shot.who as string[]) : []);
  const people = (Array.isArray(args.people) ? args.people : []).slice(0, 8).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    if (typeof o.who !== 'string' || !onScreen.has(o.who)) throw new ToolInputError(`people[${i}]: ${typeof o.who === 'string' ? `${o.who} isn't in shot ${shot.id}` : 'who is required'} (on screen: ${[...onScreen].join(', ') || 'nobody'})`);
    return { who: o.who, x: num(o.x, `people[${i}].x`, -20, 20) ?? 0, z: num(o.z, `people[${i}].z`, -20, 20) ?? 0, facing_deg: num(o.facing_deg, `people[${i}].facing_deg`, -180, 180) };
  });
  const change: Change = { type: 'camera', angle_deg: num(args.angle_deg, 'angle_deg', -89, 89), distance_m: num(args.distance_m, 'distance_m', 0.3, 60), height_m: num(args.height_m, 'height_m', 0, 30), people };
  if (change.angle_deg === null && change.distance_m === null && change.height_m === null && !people.length) throw new ToolInputError('nothing to change: give an angle, a distance, a height or people');
  return draftEdit(agent, adaptation, version, shot, change, `Shot ${shot.n}: camera and staging`, args.answering);
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
  return { gap: g.id, shown: 'to your person on their You page, under "What your agent couldn\'t do", and to the site\'s owner, who reads them as the build list; never published' };
}

export type FailureKind = 'input' | 'error' | 'timeout' | 'refused';

/**
 * A tool call that failed (owner, 2026-10-25, step 0: "so we can see what Garance's and my Claude hit"): which tool,
 * the kind (input: the tool said no to what was sent; refused: a scope or a daily limit; error: our side broke;
 * timeout), the message the agent was given (or our error's code), and the names of the arguments, never their values.
 * Seen by the person on /you and by the owner. Never throws: a failure to record must not change the agent's reply.
 */
export async function recordFailure(agent: Agent, tool: string, kind: FailureKind, message: string, args: Record<string, unknown>) {
  try {
    const kept = failureRecord(tool, message, args);
    await sql()`insert into studio.agent_failures (person, agent_id, agent_name, tool, kind, message, arg_names)
      values (${agent.person}, ${agent.id}, ${agent.name}, ${kept.tool}, ${kind}, ${kept.message}, ${kept.argNames})`;
  } catch (e) {
    console.error('agent failure not recorded', (e as { code?: string }).code ?? 'unknown');
  }
}

const IDENT = /^[A-Za-z0-9_]{1,60}$/;
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What a failure keeps (owner, 2026-10-25: "no recorded failure message contains an argument's value"): the message
 * with every value the agent sent taken out and replaced by ‹its argument's name›: whole values in any case, numbers
 * as whole tokens, and any run of 12 or more characters copied from a longer text (a message quoting part of what was
 * sent). Argument names that aren't plain identifiers, and a tool name that isn't one, are kept as placeholders, so
 * no words can travel in a name either.
 */
export function failureRecord(tool: string, message: string, args: Record<string, unknown>) {
  const leaves: { name: string; value: string }[] = [];
  const walk = (v: unknown, name: string, depth: number) => {
    if (depth > 6) return;
    if (typeof v === 'string' && v.trim()) leaves.push({ name, value: v.trim() });
    else if (typeof v === 'number' && Number.isFinite(v)) leaves.push({ name, value: String(v) });
    else if (Array.isArray(v)) v.forEach((x) => walk(x, name, depth + 1));
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, name, depth + 1);
  };
  const safeName = (k: string) => (IDENT.test(k) ? k : 'argument');
  for (const [k, v] of Object.entries(args ?? {})) walk(v, safeName(k), 0);
  const toolOk = /^[a-z_]{1,60}$/.test(tool);
  if (!toolOk && tool.trim()) leaves.push({ name: 'tool', value: tool.trim() });
  let out = message;
  for (const { name, value } of leaves.sort((a, b) => b.value.length - a.value.length)) {
    const mark = `‹${name}›`;
    out = value.length >= 3 && !/^\d+(\.\d+)?$/.test(value)
      ? out.replace(new RegExp(escapeRe(value), 'gi'), mark)
      : out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(value)}(?![\\p{L}\\p{N}_])`, 'giu'), mark);
    if (value.length >= 12) {
      // Fragments: any stretch of 12 or more characters of the message that also appears in the value.
      const low = value.toLowerCase();
      let i = 0, rebuilt = '';
      while (i < out.length) {
        if (out.length - i >= 12 && low.includes(out.slice(i, i + 12).toLowerCase())) {
          let j = i + 12;
          while (j < out.length && low.includes(out.slice(i, j + 1).toLowerCase())) j++;
          rebuilt += mark;
          i = j;
        } else rebuilt += out[i++];
      }
      out = rebuilt;
    }
  }
  return {
    tool: toolOk ? tool : '(not a tool name)',
    message: (out.trim() || '(no message)').slice(0, 1000),
    argNames: Object.keys(args ?? {}).slice(0, 20).map(safeName),
  };
}

type FailureRow = { id: string; person: string; agent_name: string; tool: string; kind: FailureKind; message: string; arg_names: string[]; created_at: Date };
const failureView = (r: FailureRow) => ({ id: r.id, agent: r.agent_name, tool: r.tool, kind: r.kind, message: r.message, args: r.arg_names, createdAt: new Date(r.created_at).toISOString() });

/** A person's agents' failed tool calls, newest first ([] until NEXT_agent_pictures is applied). */
export async function failuresOf(person: number) {
  const rows = await sql()<FailureRow[]>`select * from studio.agent_failures where person = ${person} order by created_at desc limit 50`.catch(() => []);
  return rows.map(failureView);
}

/** Everyone's failed tool calls, for the owner only, with who. */
export async function allFailures(reader: number) {
  if (reader !== suggestionsReader()) return [];
  const rows = await sql()<FailureRow[]>`select * from studio.agent_failures order by created_at desc limit 200`.catch(() => []);
  const who = new Map<number, string>();
  for (const p of new Set(rows.map((r) => Number(r.person)))) who.set(p, (await agentLabel(p, null)).label);
  return rows.map((r) => ({ ...failureView(r), who: who.get(Number(r.person))! }));
}

/**
 * Everyone's gaps, for the owner only (owner, 2026-10-22: "I want to see everything someone tries to do that they
 * can't"), with who asked: the build list.
 */
export async function allGaps(reader: number) {
  if (reader !== suggestionsReader()) return [];
  const rows = await sql()<{ id: string; person: string; agent_name: string; asked: string; missing: string; created_at: Date }[]>`
    select id, person, agent_name, asked, missing, created_at from studio.agent_gaps order by created_at desc limit 200`;
  const who = new Map<number, string>();
  for (const p of new Set(rows.map((r) => Number(r.person)))) who.set(p, (await agentLabel(p, null)).label);
  return rows.map((r) => ({ id: r.id, person: Number(r.person), who: who.get(Number(r.person))!, agent: r.agent_name, asked: r.asked, missing: r.missing, createdAt: new Date(r.created_at).toISOString() }));
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

