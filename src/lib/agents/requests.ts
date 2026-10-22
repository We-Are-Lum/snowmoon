import 'server-only';
import type postgres from 'postgres';
import { ToolInputError } from '../agent/tools';
import { editorData } from '../agent/data';
import { sql } from './core';

/**
 * What a person tells their agent (owner, 2026-10-20, the main goal: "humans do the creative acts; AI does
 * all the work"). An idea, a note on a frame, a moment or a draft, "try again", or "say more". Typed or
 * spoken: a spoken one is transcribed, shown to the person to check, and kept as their words (the
 * recording is never kept). These are the person's own words: private until a version that answers them
 * is published, then shown as theirs in that version's stamp.
 */
type Sql = postgres.Sql;
export type RequestKind = 'idea' | 'note' | 'again' | 'more';

export interface RequestView {
  id: string;
  kind: RequestKind;
  words: string;
  spoken: boolean;
  about:
    | { version: string; title: string; n: number; status: string }
    | { moment: string; shot: string; frame: string | null; lines: string[]; seconds?: number; at?: string; line_there?: string | null; video?: string; next?: string }
    | null;
  createdAt: string;
}

/** A moment is "<adaptation>/<version>/<shot>" of a published scene version. */
export function momentOk(m: string): { adaptation: number; version: number; shot: string } | null {
  const x = m.match(/^(\d{1,6})\/(\d{1,6})\/([A-Za-z0-9-]{1,40})$/);
  if (!x) return null;
  const d = editorData(Number(x[1]), Number(x[2]));
  return d?.shots.some((s) => s.id === x[3]) ? { adaptation: Number(x[1]), version: Number(x[2]), shot: x[3] } : null;
}

/** m:ss, for a time in a video. */
export const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * The moment at a time in a published version's video (owner, 2026-10-22: "pause at any point and log notes"):
 * the shot on screen then, from that version's own editor data (its shots' times are the cut's).
 */
export function momentAt(adaptation: number, version: number, seconds: number): { moment: string; shot: string; seconds: number } | null {
  if (!Number.isInteger(adaptation) || !Number.isInteger(version) || !(seconds >= 0 && seconds < 36000)) return null;
  const d = editorData(adaptation, version);
  if (!d?.shots.length) return null;
  const t = Math.round(seconds * 100) / 100;
  const shot = d.shots.find((s) => t >= s.from && t < s.to) ?? (t >= d.shots[d.shots.length - 1].from ? d.shots[d.shots.length - 1] : null);
  return shot ? { moment: `${adaptation}/${version}/${shot.id}`, shot: shot.id, seconds: t } : null;
}

export async function addRequest(person: number, kind: RequestKind, words: string, spoken: boolean, target: { version?: string; moment?: string; seconds?: number }): Promise<string> {
  const text = words.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text || text.length > 2000) throw new ToolInputError('Say or type 1 to 2,000 characters.');
  const s = sql();
  if (target.version) {
    // A note on a version: the person's own (draft or published) or anyone's published one.
    const [v] = await s<{ ok: boolean }[]>`select (p.person = ${person} and v.status <> 'discarded') or v.status = 'published' as ok
      from studio.piece_versions v join studio.pieces p on p.id = v.piece_id where v.id = ${target.version}`;
    if (!v?.ok) throw new ToolInputError('There’s nothing to talk about there.');
  }
  if (target.moment && !momentOk(target.moment)) throw new ToolInputError('That moment isn’t in a published scene.');
  if (target.seconds !== undefined && (!target.moment || !(target.seconds >= 0 && target.seconds < 36000))) throw new ToolInputError('That time isn’t in the video.');
  const [r] = await s<{ id: string }[]>`insert into studio.requests (person, kind, body, spoken, target_version, target_moment, target_seconds)
    values (${person}, ${kind}, ${text}, ${spoken}, ${target.version ?? null}, ${target.moment ?? null}, ${target.seconds ?? null}) returning id`;
  return r.id;
}

type Row = { id: string; kind: RequestKind; body: string; spoken: boolean; target_version: string | null; target_moment: string | null; target_seconds: string | null; created_at: Date; title: string | null; n: number | null; vstatus: string | null };

async function view(r: Row): Promise<RequestView> {
  let about: RequestView['about'] = null;
  if (r.target_version) about = { version: r.target_version, title: r.title ?? '', n: r.n ?? 1, status: r.vstatus ?? '' };
  else if (r.target_moment) {
    const m = momentOk(r.target_moment);
    const shot = m ? editorData(m.adaptation, m.version)?.shots.find((s) => s.id === m.shot) : null;
    const lines = Array.isArray(shot?.lines) ? (shot!.lines as { speaker?: string; text?: string }[]).map((l) => `${l.speaker ? `${l.speaker}: ` : ''}${l.text ?? ''}`) : [];
    about = { moment: r.target_moment, shot: m?.shot ?? '', frame: typeof shot?.frame === 'string' ? (shot.frame as string) : null, lines };
    if (r.target_seconds !== null && m) {
      // A note at a time in the film: the time, and the line being spoken then (the last one started by then).
      const t = Number(r.target_seconds);
      const said = (Array.isArray(shot?.lines) ? (shot!.lines as { at?: number; speaker?: string; text?: string; cue?: string }[]) : []).filter((l) => typeof l.at === 'number' && l.at <= t + 0.5).pop();
      Object.assign(about, {
        seconds: t,
        at: clock(t),
        line_there: said ? `${said.speaker ? `${said.speaker}: ` : ''}${said.text ?? ''}` : null,
        video: `adaptation ${m.adaptation}, version ${m.version}`,
        next: 'Your person paused the film here and noted this for you. Act on their own version of this scene (list_scenes shows theirs), never on someone else’s. If they have none yet, ask them to tap Remix on the scene first, or call log_gap.',
      });
    }
  }
  return { id: r.id, kind: r.kind, words: r.body, spoken: r.spoken, about, createdAt: new Date(r.created_at).toISOString() };
}

const SELECT = (s: Sql) => s`select r.id, r.kind, r.body, r.spoken, r.status, r.target_version, r.target_moment, r.target_seconds, r.created_at, p.title, v.n, v.status as vstatus
  from studio.requests r left join studio.piece_versions v on v.id = r.target_version left join studio.pieces p on p.id = v.piece_id`;

/** What a person has asked for and not yet had answered, oldest first (the agent's to-do list). */
export async function openRequests(person: number): Promise<RequestView[]> {
  const s = sql();
  const rows = await s<Row[]>`${SELECT(s)} where r.person = ${person} and r.status = 'open' order by r.created_at limit 50`;
  return Promise.all(rows.map(view));
}

export async function requestOf(person: number, id: string): Promise<(RequestView & { status: string }) | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const s = sql();
  const [r] = await s<(Row & { status: string })[]>`${SELECT(s)} where r.id = ${id} and r.person = ${person}`;
  return r ? { ...(await view(r)), status: r.status } : null;
}

/** All the words a person has given their agents: a person's line must be found here, word for word. */
export async function personWords(person: number): Promise<string[]> {
  const rows = await sql()<{ body: string }[]>`select body from studio.requests where person = ${person} order by created_at desc limit 500`;
  return rows.map((r) => r.body);
}

export async function markAnswered(t: Sql, requestId: string, versionId: string) {
  await t`update studio.requests set status = 'answered', answered_by = ${versionId} where id = ${requestId} and status = 'open'`;
}
