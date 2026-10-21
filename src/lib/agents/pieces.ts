import 'server-only';
import type postgres from 'postgres';
import { appUrl } from '../config';
import { handleFor, resolveHandle } from '../adaptation-pages';
import { ToolInputError } from '../agent/tools';
import { sha256, sql, type Agent } from './core';
import { agentLabel } from './accounts';
import { markAnswered, requestOf } from './requests';
import { editorData } from '../agent/data';

/**
 * What agents draft for their person, and what people make of it (owner, 2026-10-20; design §3–4).
 * A piece (an idea, a storyboard, frames and prompts, a character version, a brought-in image) has
 * versions. Every version an agent makes is a private draft until its person publishes it. A revision
 * is a new version: of the person's own piece, or, of someone else's published version, a new piece
 * of their own that keeps the credit chain ("revised from @y's agent's version").
 * Notes are feedback on a published version, from people (public at once) or from agents (a draft
 * until their person publishes it). Mentions resolve to people, or to a person's agents.
 */
type Sql = postgres.Sql;
export type Kind = 'idea' | 'storyboard' | 'frames' | 'character' | 'image' | 'edit';

export interface Credit {
  version: string;
  piece: string;
  n: number;
  person: number;
  handle: string | null;
  agent: string | null;
}

/**
 * The stamp (owner, 2026-10-20): what people did, kept apart from what the agent did. "Idea, words by @x ·
 * feedback from @y · made by @x's agent". Ideas and feedback are people's own words (typed or spoken);
 * words are story lines from a person or the book. An idea the agent had itself is shown as the agent's
 * and is not part of the person's stamp.
 */
export interface Stamp {
  idea?: { person: number; handle: string | null; words: string; spoken: boolean } | { agent: string };
  words?: { person?: { person: number; handle: string | null }; book?: boolean; ai?: boolean };
  feedback?: { person: number; handle: string | null; words: string; spoken: boolean; own: boolean }[];
  /** Notes from other people's agents that this takes up: credited to the agent, never to a person's stamp. */
  agent_notes?: { agent: string }[];
  made_by?: string;
}

export interface VersionView {
  id: string;
  piece: string;
  kind: Kind;
  title: string;
  n: number;
  status: 'draft' | 'published' | 'discarded';
  person: number;
  by: string;
  agent: string | null;
  wordsByAgent: boolean;
  body: Record<string, unknown>;
  credit: Credit[];
  stamp: Stamp;
  /** For storyboards and frame prompts: each shot's picture, as the scene shows it (the default view shows these, not ids). */
  shots: { shot: string; thumb: string | null; frame: string | null }[];
  /** An approved edit's result (a frame or a video), what it cost, and when it was approved. */
  made: { kind: string } | null;
  spentUsd: number | null;
  approved: boolean;
  createdAt: string;
  publishedAt: string | null;
  image: { url: string; sha256: string; declared: unknown; checked: unknown } | null;
  url: string;
}

type Row = {
  id: string; piece_id: string; kind: Kind; title: string; n: number; status: VersionView['status']; person: string;
  agent_name: string | null; words_by_agent: boolean; body: Record<string, unknown>; credit: Credit[]; stamp: Stamp; created_at: Date;
  published_at: Date | null; image_key: string | null; image_sha256: string | null; declared: unknown; checked: unknown;
  made: { kind: string } | null; spent_usd: string | null; approved_at: Date | null;
};

const SELECT = (s: Sql) => s`select v.id, v.piece_id, p.kind, p.title, v.n, v.status, p.person, v.agent_name, v.words_by_agent,
  v.body, v.credit, v.stamp, v.created_at, v.published_at, v.image_key, v.image_sha256, v.declared, v.checked, v.made, v.spent_usd, v.approved_at
  from studio.piece_versions v join studio.pieces p on p.id = v.piece_id`;

function shotsShown(body: Record<string, unknown>): VersionView['shots'] {
  const a = Number(body.adaptation);
  const v = Number(body.version);
  const list = (Array.isArray(body.items) ? body.items : Array.isArray(body.frames) ? body.frames : typeof body.shot === 'string' ? [{ shot: body.shot }] : []) as { shot?: string }[];
  if (!list.length || !Number.isInteger(a) || !Number.isInteger(v)) return [];
  const d = editorData(a, v);
  return list.map((it) => {
    const s = d?.shots.find((x) => x.id === it.shot);
    return { shot: String(it.shot), thumb: typeof s?.thumb === 'string' ? (s.thumb as string) : null, frame: typeof s?.frame === 'string' ? (s.frame as string) : null };
  });
}

export async function view(r: Row): Promise<VersionView> {
  const person = Number(r.person);
  const who = await agentLabel(person, r.agent_name);
  return {
    id: r.id, piece: r.piece_id, kind: r.kind, title: r.title, n: r.n, status: r.status, person,
    by: `@${who.short}`, agent: r.agent_name ? who.label : null, wordsByAgent: r.words_by_agent,
    body: r.body, credit: r.credit, stamp: r.stamp ?? {}, shots: shotsShown(r.body), made: r.made ?? null, spentUsd: r.spent_usd === null ? null : Number(r.spent_usd), approved: !!r.approved_at, createdAt: new Date(r.created_at).toISOString(),
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    image: r.image_key && r.image_sha256 ? { url: `${appUrl()}/api/pieces/image/${r.id}`, sha256: r.image_sha256, declared: r.declared, checked: r.checked } : null,
    url: `${appUrl()}/p/${r.piece_id}`,
  };
}

export async function versionById(id: string): Promise<VersionView | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const s = sql();
  const [r] = await s<Row[]>`${SELECT(s)} where v.id = ${id}`;
  return r ? await view(r) : null;
}

/** Can this agent see this version? Published ones, or its own person's. */
export const visibleTo = (v: VersionView, person: number) => v.status === 'published' || v.person === person;

export interface Answering {
  /** The person's request this version answers (an idea, a note, try again, say more). */
  request?: string;
  /** Published notes from other people that this revision takes up. */
  notes?: string[];
  /** Story lines in it: whose. */
  lines?: { person: boolean; book: boolean; ai: boolean };
}

/** Builds the stamp for a new version from what it answers (and, for a revision, the version it revises). */
async function stampFor(agent: Agent, a: Answering, base: VersionView | null): Promise<{ stamp: Stamp; requestId: string | null }> {
  const handle = (await handleFor(agent.person)) ?? null;
  const who = await agentLabel(agent.person, agent.name);
  const stamp: Stamp = { made_by: who.label };
  let requestId: string | null = null;
  if (a.request) {
    const r = await requestOf(agent.person, a.request);
    if (!r || r.status !== 'open') throw new ToolInputError('answering: no open request with that id from your person (see read_requests)');
    requestId = r.id;
    if (r.kind === 'idea' && !base) stamp.idea = { person: agent.person, handle, words: r.words, spoken: r.spoken };
    else stamp.feedback = [{ person: agent.person, handle, words: r.words, spoken: r.spoken, own: true }];
  }
  if (base) {
    // A revision keeps whose idea it was, and adds the feedback it answers.
    if (base.stamp.idea) stamp.idea = base.stamp.idea;
    if (base.stamp.words) stamp.words = base.stamp.words;
  }
  if (!stamp.idea && !base) stamp.idea = { agent: who.label };
  for (const id of a.notes ?? []) {
    const [n] = await sql()<{ person: string; body: string; agent_name: string | null }[]>`select person, body, agent_name from studio.notes where id = ${id} and status = 'published'`;
    if (!n) throw new ToolInputError(`notes: ${id} isn't a published note`);
    if (Number(n.person) === agent.person) continue;
    // A note an agent drafted is the agent's, even once its person published it: credited to the agent, not the person.
    if (n.agent_name) (stamp.agent_notes ??= []).push({ agent: (await agentLabel(Number(n.person), n.agent_name)).label });
    else (stamp.feedback ??= []).push({ person: Number(n.person), handle: (await handleFor(Number(n.person))) ?? null, words: n.body, spoken: false, own: false });
  }
  if (a.lines && (a.lines.person || a.lines.book || a.lines.ai))
    stamp.words = { ...(a.lines.person ? { person: { person: agent.person, handle } } : {}), ...(a.lines.book ? { book: true } : {}), ...(a.lines.ai ? { ai: true } : {}) };
  return { stamp, requestId };
}

/** A new piece with its first version, drafted by an agent for its person. */
export async function draftPiece(agent: Agent, kind: Kind, title: string, adaptationId: number | null, body: Record<string, unknown>, wordsByAgent: boolean, image?: { key: string; sha256: string; declared: unknown; checked: unknown }, answering: Answering = {}) {
  const { stamp, requestId } = await stampFor(agent, answering, null);
  const s = sql();
  return await s.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const [p] = await t<{ id: string }[]>`insert into studio.pieces (kind, person, adaptation_id, title) values (${kind}, ${agent.person}, ${adaptationId}, ${title}) returning id`;
    const [v] = await t<{ id: string }[]>`insert into studio.piece_versions (piece_id, n, body, agent_id, agent_name, words_by_agent, image_key, image_sha256, declared, checked, request_id, stamp)
      values (${p.id}, 1, ${t.json(body as postgres.JSONValue)}, ${agent.id}, ${agent.name}, ${wordsByAgent}, ${image?.key ?? null}, ${image?.sha256 ?? null},
              ${image ? t.json(image.declared as postgres.JSONValue) : null}, ${image ? t.json(image.checked as postgres.JSONValue) : null},
              ${requestId}, ${t.json(stamp as unknown as postgres.JSONValue)}) returning id`;
    if (requestId) await markAnswered(t, requestId, v.id);
    return { piece: p.id, version: v.id, stamp };
  });
}

/**
 * A revision: a new version of `of`. The person's own piece gets version n+1; someone else's published
 * version becomes a new piece of the agent's person, crediting the whole chain behind it.
 */
export async function revise(agent: Agent, of: string, body: Record<string, unknown>, wordsByAgent: boolean, title?: string, answering: Answering = {}) {
  const base = await versionById(of);
  if (!base || !visibleTo(base, agent.person)) throw new ToolInputError('no version with that id that you can see');
  if (base.status === 'discarded' && base.person !== agent.person) throw new ToolInputError('that version was discarded');
  const { stamp, requestId } = await stampFor(agent, answering, base.person === agent.person ? base : null);
  const credit: Credit[] = [{ version: base.id, piece: base.piece, n: base.n, person: base.person, handle: (await handleFor(base.person)) ?? null, agent: base.agent }, ...base.credit].slice(0, 20);
  const s = sql();
  return await s.begin(async (tx) => {
    const t = tx as unknown as Sql;
    let pieceId = base.piece;
    let n: number;
    if (base.person === agent.person) {
      const [m] = await t<{ n: number }[]>`select max(n)::int as n from studio.piece_versions where piece_id = ${pieceId}`;
      n = m.n + 1;
    } else {
      [{ id: pieceId }] = await t<{ id: string }[]>`insert into studio.pieces (kind, person, adaptation_id, title)
        select kind, ${agent.person}, adaptation_id, ${title ?? `${base.title} (revised)`} from studio.pieces where id = ${base.piece} returning id`;
      n = 1;
    }
    const [v] = await t<{ id: string }[]>`insert into studio.piece_versions (piece_id, n, body, agent_id, agent_name, words_by_agent, remix_of, credit, request_id, stamp)
      values (${pieceId}, ${n}, ${t.json(body as postgres.JSONValue)}, ${agent.id}, ${agent.name}, ${wordsByAgent}, ${base.id}, ${t.json(credit as unknown as postgres.JSONValue)},
              ${requestId}, ${t.json(stamp as unknown as postgres.JSONValue)}) returning id`;
    if (requestId) await markAnswered(t, requestId, v.id);
    // A new version of the person's own draft replaces it in their review list.
    if (base.person === agent.person && base.status === 'draft') await t`update studio.piece_versions set status = 'discarded' where id = ${base.id} and status = 'draft'`;
    return { piece: pieceId, version: v.id, n, credit, stamp };
  });
}

/** Everything of one person's: their drafts waiting (the review list) and their published work. */
export async function piecesOf(person: number, status: 'draft' | 'published') {
  const s = sql();
  const rows = await s<Row[]>`${SELECT(s)} where p.person = ${person} and v.status = ${status} order by v.created_at desc limit 100`;
  return Promise.all(rows.map(view));
}

export async function pieceVersions(pieceId: string, viewer: number | null) {
  if (!/^[0-9a-f-]{36}$/.test(pieceId)) return [];
  const s = sql();
  const rows = await s<Row[]>`${SELECT(s)} where v.piece_id = ${pieceId} and (v.status = 'published' or (p.person = ${viewer ?? 0} and v.status = 'draft')) order by v.n`;
  return Promise.all(rows.map(view));
}

/** Published work, newest first; "human-written only" leaves out anything with an agent's story words. */
export async function publishedList(humanWrittenOnly: boolean) {
  const s = sql();
  const rows = await s<Row[]>`${SELECT(s)} where v.status = 'published' and (${!humanWrittenOnly} or not v.words_by_agent) order by v.published_at desc limit 60`;
  return Promise.all(rows.map(view));
}

/** Only the person can publish or discard their drafts; publishing a note works the same way. */
export async function decide(person: number, what: 'version' | 'note', id: string, action: 'publish' | 'discard'): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const s = sql();
  const status = action === 'publish' ? 'published' : 'discarded';
  if (what === 'version') {
    const rows = await s`update studio.piece_versions v set status = ${status},
        published_at = case when ${status} = 'published' then now() else null end,
        published_by = case when ${status} = 'published' then ${person}::bigint else null end
      from studio.pieces p where v.id = ${id} and p.id = v.piece_id and p.person = ${person} and v.status = 'draft' returning v.id`;
    return rows.length > 0;
  }
  const rows = await s`update studio.notes set status = ${status}, published_at = case when ${status} = 'published' then now() else null end
    where id = ${id} and person = ${person} and status = 'draft'
      and exists (select 1 from studio.piece_versions v where v.id = version_id and v.status = 'published') returning id`;
  return rows.length > 0;
}

// --- Notes -------------------------------------------------------------------------------------

export type Mention = { kind: 'person'; person: number; handle: string } | { kind: 'agents'; person: number; handle: string };

/** @handle mentions a person; "@handle's agent" (or "@handle/agent") mentions their agents. Unknown names stay plain text. */
export async function findMentions(text: string): Promise<Mention[]> {
  const out: Mention[] = [];
  for (const m of text.matchAll(/(?:^|[^\w@])@((?:0x[0-9a-fA-F]{40})|[a-z0-9][a-z0-9.-]{0,30})(?:('s|’s) agents?\b|\/agents?\b)?/gi)) {
    const r = await resolveHandle(m[1]).catch(() => ({ kind: 'none' as const }));
    if (r.kind !== 'person') continue;
    const kind = m[2] || /\/agents?$/i.test(m[0]) ? 'agents' : 'person';
    if (!out.some((x) => x.kind === kind && x.person === r.person)) out.push({ kind, person: r.person, handle: r.handle });
    if (out.length >= 10) break;
  }
  return out;
}

export interface NoteView {
  id: string;
  version: string;
  piece: string;
  by: string;
  agent: string | null;
  text: string;
  mentions: Mention[];
  status: string;
  createdAt: string;
}

type NoteRow = { id: string; version_id: string; piece_id: string; person: string; agent_name: string | null; body: string; mentions: Mention[]; status: string; created_at: Date };

async function noteView(r: NoteRow): Promise<NoteView> {
  const who = await agentLabel(Number(r.person), r.agent_name);
  return { id: r.id, version: r.version_id, piece: r.piece_id, by: `@${who.short}`, agent: r.agent_name ? who.label : null, text: r.body, mentions: r.mentions, status: r.status, createdAt: new Date(r.created_at).toISOString() };
}

/**
 * A note on a published version. A person's is public at once; an agent's is a draft for its person.
 * The same agent can't post the same note twice.
 */
export async function addNote(on: string, person: number, agent: Agent | null, text: string): Promise<NoteView> {
  const v = await versionById(on);
  if (!v || v.status !== 'published') throw new ToolInputError('notes go on published versions; no published version with that id');
  const s = sql();
  const hash = sha256(text.toLowerCase().replace(/\s+/g, ' ').trim());
  if (agent) {
    const [dup] = await s`select 1 from studio.notes where agent_id = ${agent.id} and body_hash = ${hash}`;
    if (dup) throw new ToolInputError('you already drafted that note');
  }
  const mentions = await findMentions(text);
  const [r] = await s<NoteRow[]>`insert into studio.notes (version_id, person, agent_id, agent_name, body, body_hash, mentions, status, published_at)
    values (${on}, ${person}, ${agent?.id ?? null}, ${agent?.name ?? null}, ${text}, ${hash}, ${s.json(mentions as unknown as postgres.JSONValue)},
            ${agent ? 'draft' : 'published'}, ${agent ? null : new Date()})
    returning id, version_id, (select piece_id from studio.piece_versions where id = ${on}) as piece_id, person, agent_name, body, mentions, status, created_at`;
  return await noteView(r);
}

export async function notesOn(versionIds: string[]): Promise<NoteView[]> {
  if (!versionIds.length) return [];
  const s = sql();
  const rows = await s<NoteRow[]>`select n.id, n.version_id, v.piece_id, n.person, n.agent_name, n.body, n.mentions, n.status, n.created_at
    from studio.notes n join studio.piece_versions v on v.id = n.version_id
    where n.version_id = any(${versionIds}::uuid[]) and n.status = 'published' order by n.created_at`;
  return Promise.all(rows.map(noteView));
}

export async function draftNotesOf(person: number): Promise<NoteView[]> {
  const s = sql();
  const rows = await s<NoteRow[]>`select n.id, n.version_id, v.piece_id, n.person, n.agent_name, n.body, n.mentions, n.status, n.created_at
    from studio.notes n join studio.piece_versions v on v.id = n.version_id
    where n.person = ${person} and n.status = 'draft' order by n.created_at desc limit 100`;
  return Promise.all(rows.map(noteView));
}

/**
 * Feedback for an agent: published notes on its person's published work (by anyone else), and
 * published notes anywhere that mention its person or its person's agents. Newest first.
 */
export async function feedbackFor(person: number, since: Date | null): Promise<(NoteView & { onTitle: string; onVersion: number; addressedToAgents: boolean })[]> {
  const s = sql();
  const rows = await s<(NoteRow & { title: string; n: number; addressed: boolean })[]>`
    select n.id, n.version_id, v.piece_id, n.person, n.agent_name, n.body, n.mentions, n.status, n.created_at, p.title, v.n,
      n.mentions @> ${s.json([{ kind: 'agents', person }] as unknown as postgres.JSONValue)} as addressed
    from studio.notes n join studio.piece_versions v on v.id = n.version_id join studio.pieces p on p.id = v.piece_id
    where n.status = 'published' and n.person <> ${person}
      and (p.person = ${person} or n.mentions @> ${s.json([{ person }] as unknown as postgres.JSONValue)})
      and (${since === null} or n.created_at > ${since ?? new Date(0)})
    order by n.created_at desc limit 50`;
  return Promise.all(rows.map(async (r) => ({ ...(await noteView(r)), onTitle: r.title, onVersion: r.n, addressedToAgents: r.addressed })));
}
