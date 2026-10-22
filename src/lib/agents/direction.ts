import 'server-only';
import { ToolInputError } from '../agent/tools';
import { editorData, type DataShot, type EditorData } from '../agent/data';
import { getVersion } from '../adaptation-pages';
import { sql, type Agent } from './core';

/**
 * Direction notes and line rewrites (owner, 2026-10-20: "always my words exactly as I give them"). On the
 * person's own scene version, private to them:
 * - intent (per moment, i.e. a shot): where to take the viewer, the feeling, the thoughts;
 * - acting (per character per shot): thinking, movement, where they look. Fed into that shot's frame and
 *   video prompts when the person approves a try, and recorded in the recipe as theirs;
 * - delivery (per line): how it's said. On the re-record sheet;
 * - a rewrite: the person's new line, exactly as written, a draft against the line it replaces. On the
 *   re-record sheet until it's recorded.
 * Filed on the script page by the person, or by their agent from what they said: the agent passes their words
 * as given and names the shot; when it isn't sure which shot, it asks them (find_line helps). Nothing here
 * guesses a shot: a note without one is refused.
 * What the person files is theirs at once. What their agent files is labelled "filed by <agent>" until the
 * person taps "These were my words" (owner, 2026-10-21); confirmed_at records that tap.
 */
export type DirectionKind = 'intent' | 'acting' | 'delivery';
export const DIRECTION_KINDS: DirectionKind[] = ['intent', 'acting', 'delivery'];
type By = { agent: Agent | null; request?: string | null };
type Line = { cue: string; at?: number; speaker?: string | null; text?: string };

const posInt = (v: unknown, what: string) => {
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new ToolInputError(`${what} must be a whole number from 1`);
  return n;
};

/** The person's words, exactly as given: only control characters are taken out, and the ends trimmed. */
export function ownWords(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string') throw new ToolInputError(`${what}: your person's words, exactly as they gave them`);
  const text = v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text || text.length > max) throw new ToolInputError(`${what}: 1 to ${max.toLocaleString('en')} characters, your person's words exactly`);
  return text;
}

/** A version the person made, and its data. */
async function ownVersion(person: number, a: unknown, v: unknown): Promise<{ adaptation: number; version: number; data: EditorData }> {
  const adaptation = posInt(a, 'adaptation');
  const version = posInt(v, 'version');
  const row = await getVersion(version);
  if (!row || row.adaptationId !== adaptation || row.hidden || row.author !== person) throw new ToolInputError('Direction is only for your person’s own versions (see list_scenes for theirs).');
  const data = editorData(adaptation, version);
  if (!data) throw new ToolInputError(`no data for version ${version}`);
  return { adaptation, version, data };
}

/** A request the note answers must be the person's own. */
async function requestOk(person: number, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ToolInputError('answering must be an id from read_requests');
  const [r] = await sql()<{ id: string }[]>`select id from studio.requests where id = ${id} and person = ${person}`;
  if (!r) throw new ToolInputError('answering: no request with that id from your person (see read_requests)');
  return r.id;
}

const linesOf = (s: DataShot) => ((s.lines ?? []) as Line[]).filter((l) => typeof l.cue === 'string');

/** The cast: every speaker, and the shots' letters (Z, B, D) for them. */
function castOf(d: EditorData) {
  const names = new Set<string>();
  for (const s of d.shots) for (const l of linesOf(s)) if (l.speaker) names.add(l.speaker);
  const byLetter = new Map<string, string>();
  for (const n of names) if (!byLetter.has(n[0].toUpperCase())) byLetter.set(n[0].toUpperCase(), n);
  return { names, byLetter };
}
const onScreen = (d: EditorData, s: DataShot) => {
  const { byLetter } = castOf(d);
  return (Array.isArray(s.who) ? (s.who as string[]) : []).map((w) => byLetter.get(w) ?? w);
};

const shotOf = (d: EditorData, id: unknown) => {
  if (typeof id !== 'string' || !id) throw new ToolInputError('shot is required. If you aren’t sure which shot your person means, ask them (find_line can show the candidates); never guess.');
  const s = d.shots.find((x) => x.id === id);
  if (!s) throw new ToolInputError(`no shot "${id}" in that version (see get_scene or find_line); if you aren’t sure which one, ask your person`);
  return s;
};
const lineOf = (d: EditorData, cue: unknown) => {
  if (typeof cue !== 'string' || !cue) throw new ToolInputError('cue is required: the line\'s cue (find_line shows them). If you aren’t sure which line, ask your person; never guess.');
  for (const s of d.shots) for (const l of linesOf(s)) if (l.cue === cue) return { shot: s, line: l };
  throw new ToolInputError(`no line "${cue}" in that version (see find_line); if you aren’t sure which line, ask your person`);
};

export async function addDirection(person: number, by: By, args: Record<string, unknown>) {
  const { adaptation, version, data } = await ownVersion(person, args.adaptation, args.version);
  const kind = args.kind as DirectionKind;
  if (!DIRECTION_KINDS.includes(kind)) throw new ToolInputError('kind is intent (the moment: where to take the viewer, the feeling, the thoughts), acting (a character in a shot: thinking, movement, where they look) or delivery (a line: how it’s said)');
  const body = ownWords(args.text, 'text', 1000);
  const request = await requestOk(person, by.request);
  let shot: DataShot;
  let character: string | null = null;
  let cue: string | null = null;
  if (kind === 'delivery') {
    const found = lineOf(data, args.cue);
    if (args.shot !== undefined && args.shot !== found.shot.id) throw new ToolInputError(`line ${found.line.cue} is in shot ${found.shot.id}, not ${String(args.shot)}; ask your person which they mean`);
    shot = found.shot;
    cue = found.line.cue;
  } else {
    shot = shotOf(data, args.shot);
    if (kind === 'acting') {
      const { names } = castOf(data);
      const c = typeof args.character === 'string' ? [...names].find((n) => n.toLowerCase() === (args.character as string).trim().toLowerCase()) : undefined;
      if (!c) throw new ToolInputError(`character is required for acting: one of ${[...names].join(', ')}`);
      const there = onScreen(data, shot);
      const speaks = linesOf(shot).some((l) => l.speaker === c);
      if (!there.includes(c) && !speaks) throw new ToolInputError(`${c} isn’t in shot ${shot.id} (on screen: ${there.join(', ') || 'nobody'}); ask your person which shot they mean`);
      character = c;
    }
  }
  const [r] = await sql()<{ id: string }[]>`insert into studio.direction_notes (person, adaptation_id, version, kind, shot, character, cue, body, agent_id, agent_name, request_id, confirmed_at)
    values (${person}, ${adaptation}, ${version}, ${kind}, ${shot.id}, ${character}, ${cue}, ${body}, ${by.agent?.id ?? null}, ${by.agent?.name ?? null}, ${request}, ${by.agent ? null : new Date()}) returning id`;
  return { note: r.id, kind, shot: shot.id, n: shot.n, ...(character ? { character } : {}), ...(cue ? { cue } : {}), text: body, filed: by.agent ? 'on your person’s script page, labelled as filed by you until they confirm the words are theirs' : 'on the script page' };
}

export async function rewriteLine(person: number, by: By, args: Record<string, unknown>) {
  const { adaptation, version, data } = await ownVersion(person, args.adaptation, args.version);
  const { shot, line } = lineOf(data, args.cue);
  const body = ownWords(args.text, 'text', 600);
  const original = (line.text ?? '').trim() || '(no words)';
  const request = await requestOk(person, by.request);
  const s = sql();
  const id = await s.begin(async (tx) => {
    // The newest rewrite of a line is the draft; an earlier one is withdrawn (it stays in the history).
    await tx`update studio.line_rewrites set withdrawn_at = now() where person = ${person} and adaptation_id = ${adaptation} and version = ${version} and cue = ${line.cue} and withdrawn_at is null`;
    const [r] = await tx<{ id: string }[]>`insert into studio.line_rewrites (person, adaptation_id, version, shot, cue, original, body, agent_id, agent_name, request_id, confirmed_at)
      values (${person}, ${adaptation}, ${version}, ${shot.id}, ${line.cue}, ${original}, ${body}, ${by.agent?.id ?? null}, ${by.agent?.name ?? null}, ${request}, ${by.agent ? null : new Date()}) returning id`;
    return r.id;
  });
  return { rewrite: id, cue: line.cue, shot: shot.id, n: shot.n, speaker: line.speaker ?? null, original, text: body, status: 'draft', rerecord: 'on the re-record sheet until it’s recorded' };
}

/** Withdraw a note or a rewrite, mark a rewrite recorded, or confirm an agent-filed one as the person's words (the person, on the script page). */
export async function settle(person: number, id: string, action: 'withdraw' | 'recorded' | 'confirm'): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const s = sql();
  if (action === 'confirm') {
    const a = await s`update studio.direction_notes set confirmed_at = now() where id = ${id} and person = ${person} and withdrawn_at is null and confirmed_at is null returning id`;
    if (a.length) return true;
    const b = await s`update studio.line_rewrites set confirmed_at = now() where id = ${id} and person = ${person} and withdrawn_at is null and confirmed_at is null returning id`;
    return b.length > 0;
  }
  if (action === 'recorded') {
    const r = await s`update studio.line_rewrites set recorded_at = now() where id = ${id} and person = ${person} and withdrawn_at is null and recorded_at is null returning id`;
    return r.length > 0;
  }
  const a = await s`update studio.direction_notes set withdrawn_at = now() where id = ${id} and person = ${person} and withdrawn_at is null returning id`;
  if (a.length) return true;
  const b = await s`update studio.line_rewrites set withdrawn_at = now() where id = ${id} and person = ${person} and withdrawn_at is null returning id`;
  return b.length > 0;
}

type NoteRow = { id: string; kind: DirectionKind; shot: string; character: string | null; cue: string | null; body: string; agent_name: string | null; created_at: Date; confirmed_at: Date | null };
type RewriteRow = { id: string; shot: string; cue: string; original: string; body: string; agent_name: string | null; created_at: Date; confirmed_at: Date | null; recorded_at: Date | null };
// filedBy: the agent's name while the person hasn't confirmed the words as theirs; null once they have (or filed it themselves).
const filedBy = (r: { agent_name: string | null; confirmed_at: Date | null }) => (r.confirmed_at ? null : (r.agent_name ?? 'your agent'));
const noteView = (r: NoteRow) => ({ id: r.id, kind: r.kind, shot: r.shot, character: r.character, cue: r.cue, text: r.body, filedBy: filedBy(r), at: new Date(r.created_at).toISOString() });
const rewriteView = (r: RewriteRow) => ({ id: r.id, shot: r.shot, cue: r.cue, original: r.original, text: r.body, filedBy: filedBy(r), at: new Date(r.created_at).toISOString(), recorded: r.recorded_at ? new Date(r.recorded_at).toISOString() : null });
export type NoteView = ReturnType<typeof noteView>;
export type RewriteView = ReturnType<typeof rewriteView>;

async function live(person: number, adaptation: number, version: number) {
  const s = sql();
  const notes = await s<NoteRow[]>`select id, kind, shot, character, cue, body, agent_name, created_at, confirmed_at from studio.direction_notes
    where person = ${person} and adaptation_id = ${adaptation} and version = ${version} and withdrawn_at is null order by created_at`;
  const rewrites = await s<RewriteRow[]>`select id, shot, cue, original, body, agent_name, created_at, confirmed_at, recorded_at from studio.line_rewrites
    where person = ${person} and adaptation_id = ${adaptation} and version = ${version} and withdrawn_at is null order by created_at`;
  return { notes: notes.map(noteView), rewrites: rewrites.map(rewriteView) };
}

export type ScriptLine = { cue: string; at: number; time: string; speaker: string | null; text: string; delivery: NoteView[]; rewrite: RewriteView | null };
export type ScriptShot = { id: string; n: number; from: number; to: number; time: string; onScreen: string[]; thumb: string | null; intent: NoteView[]; acting: NoteView[]; lines: ScriptLine[] };

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** The script page: every shot in order, its lines with speaker and time, and the person's notes inline. */
export async function scriptOf(person: number, a: unknown, v: unknown) {
  const { adaptation, version, data } = await ownVersion(person, a, v);
  const { notes, rewrites } = await live(person, adaptation, version);
  const shots: ScriptShot[] = data.shots.map((s) => ({
    id: s.id,
    n: s.n,
    from: s.from,
    to: s.to,
    time: clock(s.from),
    onScreen: onScreen(data, s),
    thumb: typeof s.thumb === 'string' ? (s.thumb as string) : null,
    intent: notes.filter((x) => x.kind === 'intent' && x.shot === s.id),
    acting: notes.filter((x) => x.kind === 'acting' && x.shot === s.id),
    lines: linesOf(s).map((l) => ({
      cue: l.cue,
      at: typeof l.at === 'number' ? l.at : s.from,
      time: clock(typeof l.at === 'number' ? l.at : s.from),
      speaker: l.speaker ?? null,
      text: l.text ?? '',
      delivery: notes.filter((x) => x.kind === 'delivery' && x.cue === l.cue),
      rewrite: rewrites.find((r) => r.cue === l.cue && !r.recorded) ?? null,
    })),
  }));
  return { adaptation, version, title: data.title, cast: [...castOf(data).names], shots, rerecord: rerecordFrom(shots) };
}

/** The re-record sheet: every line with a rewrite not yet recorded or a delivery note, by speaker, in film order. */
function rerecordFrom(shots: ScriptShot[]) {
  const rows = shots.flatMap((s) =>
    s.lines.filter((l) => l.rewrite || l.delivery.length).map((l) => ({ shot: s.id, n: s.n, cue: l.cue, time: l.time, speaker: l.speaker ?? '(no speaker)', line: l.rewrite?.text ?? l.text, original: l.rewrite ? l.text : null, rewrite: l.rewrite?.id ?? null, rewriteFiledBy: l.rewrite?.filedBy ?? null, delivery: l.delivery.map((d) => d.text), notes: l.delivery })),
  );
  const order = [...new Set(rows.map((r) => r.speaker))];
  return order.map((speaker) => ({ speaker, lines: rows.filter((r) => r.speaker === speaker) }));
}

/** Acting notes for a shot, for its frame and video prompts and their recipes (approve.ts). */
export async function actingFor(person: number, adaptation: number, version: number, shot: string) {
  const rows = await sql()<{ character: string; body: string; agent_name: string | null; confirmed_at: Date | null }[]>`select character, body, agent_name, confirmed_at from studio.direction_notes
    where person = ${person} and adaptation_id = ${adaptation} and version = ${version} and shot = ${shot} and kind = 'acting' and withdrawn_at is null order by created_at`;
  // Unconfirmed agent-filed notes still go into the prompt, but the recipe says who filed them.
  return rows.map((r) => ({ character: r.character, text: r.body, by: 'person' as const, filedBy: filedBy(r) }));
}

/** Acting notes as a prompt sentence: the person's words, quoted, per character. */
export const actingPrompt = (acting: { character: string; text: string }[]) =>
  acting.length ? `Acting direction: ${acting.map((a) => `${a.character}: ${a.text}`).join(' ')}` : '';

/** Lines whose words (or speaker) match, so the agent can name the shot, or ask when more than one fits. */
export async function findLine(person: number, args: Record<string, unknown>) {
  const { data } = await ownVersion(person, args.adaptation, args.version);
  const q = typeof args.words === 'string' ? args.words.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter((w) => w.length > 1) : [];
  const speaker = typeof args.speaker === 'string' ? args.speaker.trim().toLowerCase() : '';
  if (!q.length && !speaker) throw new ToolInputError('give some of the line’s words, or a speaker');
  const hits = data.shots.flatMap((s) =>
    linesOf(s)
      .filter((l) => (!speaker || (l.speaker ?? '').toLowerCase() === speaker) && q.every((w) => (l.text ?? '').toLowerCase().includes(w)))
      .map((l) => ({ shot: s.id, n: s.n, cue: l.cue, time: clock(typeof l.at === 'number' ? l.at : s.from), speaker: l.speaker ?? null, text: l.text ?? '', on_screen: onScreen(data, s) })),
  );
  return { matches: hits.slice(0, 20), more: Math.max(0, hits.length - 20), ask: hits.length === 1 ? null : hits.length ? 'More than one line fits: ask your person which one they mean before filing.' : 'Nothing fits: ask your person which line or shot they mean.' };
}

/** What the agent can read back: the person's notes and rewrites on a version. */
export async function directionOf(person: number, args: Record<string, unknown>) {
  const { adaptation, version } = await ownVersion(person, args.adaptation, args.version);
  return live(person, adaptation, version);
}
