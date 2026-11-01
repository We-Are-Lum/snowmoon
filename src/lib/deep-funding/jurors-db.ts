import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, DEEP_FUNDING } from '../config';
import { bookCharacter } from '../images/designs';
import { PRIVACY } from '../legal';
import { nodeOf, type CreditGraph } from './graph';
import { checkAnswer, jurorAllowed, jurorQuestions, type JurorQuestion } from './jurors';
import { entrantsFor, loadGraph } from './load';
import type { JurorAnswer } from './scoring';

/**
 * The juror page's server half (DEEP_FUNDING.jurors, off). Tables: studio.deep_funding_jurors and studio.juror_answers
 * (NEXT_deep_funding_jurors.sql, not applied). Jurors never see a model's answer: nothing here reads one.
 * The site never adds a juror: the owner does, in the SQL Editor (supabase/drafts/ADD-JUROR-deep_funding.sql), so no
 * admin gains a new power (P5b). The site only reads the list, and checks again, each time, that the juror made no
 * version in the graph and has no entry for the character (jurorAllowed).
 * Legal texts describe today (owner, 2026-10-18): the page works only once Privacy describes the jurors' answers
 * (docs/legal/deep-funding-draft.md), whatever the switch says.
 */
type Sql = postgres.Sql;

export const privacyDescribesJurors = (privacy = PRIVACY) => /deep funding/i.test((privacy.sections.find((s) => s.n === 4)?.body ?? []).flat().join(' '));

/** The switch, once Privacy says so. */
export const jurorsOn = (privacy = PRIVACY) => DEEP_FUNDING.jurors && privacyDescribesJurors(privacy);

const nameOf = (character: string) => bookCharacter(character)?.name ?? null;
const finalOf = (character: string) => DEEP_FUNDING.finals[character] ?? null;

export async function isJuror(sql: Sql, fid: number, character: string): Promise<boolean> {
  const [r] = await sql`select 1 from studio.deep_funding_jurors where challenge = ${CHALLENGE.id} and character = ${character} and fid = ${fid}`;
  return Boolean(r);
}

async function graphFor(sql: Sql, character: string): Promise<CreditGraph | null> {
  const final = finalOf(character);
  if (!final || !CHALLENGE.characters.includes(character)) return null;
  return loadGraph(sql, character, final);
}

export interface ShownVersion {
  id: string;
  title: string;
  byName: string | null;
  picture: string | null;
  isFinal: boolean;
}

export interface JurorView {
  character: string;
  name: string;
  final: ShownVersion;
  questions: (JurorQuestion & { answered: boolean })[];
  versions: Record<string, ShownVersion>;
}

const shown = (g: CreditGraph, id: string, bodies: Map<string, { by_name?: string | null }>): ShownVersion => {
  const n = nodeOf(g, id);
  return { id, title: n.words.title, byName: bodies.get(id)?.by_name ?? null, picture: n.views.find((v) => v.view === 'front')?.url ?? n.views[0]?.url ?? null, isFinal: n.isFinal };
};

/** A juror's questions for a character, and which they have answered. Null if they are not (or can no longer be) its juror. */
export async function jurorView(sql: Sql, fid: number, character: string): Promise<JurorView | null> {
  if (!(await isJuror(sql, fid, character))) return null;
  const g = await graphFor(sql, character);
  const name = nameOf(character);
  if (!g || !name) return null;
  if (!jurorAllowed(fid, g, await entrantsFor(sql, name)).ok) return null;
  const qs = jurorQuestions(g, fid);
  const done = new Set((await sql`select distinct question_no from studio.juror_answers where challenge = ${CHALLENGE.id} and character = ${character} and fid = ${fid}`).map((r) => Number(r.question_no)));
  const ids = [...new Set(qs.flatMap((q) => (q.kind === 'compare' ? [q.a, q.b] : [q.node])).concat(g.final))];
  const bodies = new Map((await sql`select id, body from studio.element_versions where id in ${sql(ids)}`).map((r) => [String(r.id), (r.body ?? {}) as { by_name?: string | null }]));
  return {
    character,
    name,
    final: shown(g, g.final, bodies),
    questions: qs.map((q) => ({ ...q, answered: done.has(q.no) })),
    versions: Object.fromEntries(ids.map((id) => [id, shown(g, id, bodies)])),
  };
}

export async function saveAnswer(sql: Sql, fid: number, character: string, body: unknown): Promise<{ ok: true } | { ok: false; status: number; why: string }> {
  if (!(await isJuror(sql, fid, character))) return { ok: false, status: 403, why: 'You are not a juror for this character' };
  const g = await graphFor(sql, character);
  const name = nameOf(character);
  if (!g || !name) return { ok: false, status: 404, why: 'No final version for that character yet' };
  const allowed = jurorAllowed(fid, g, await entrantsFor(sql, name));
  if (!allowed.ok) return { ok: false, status: 403, why: allowed.why };
  const c = checkAnswer(jurorQuestions(g, fid), body);
  if (!c.ok) return { ok: false, status: 400, why: c.why };
  const q = c.q;
  const a = c.answer;
  await sql`insert into studio.juror_answers ${sql({
    challenge: CHALLENGE.id,
    character,
    final_version_id: g.final,
    fid,
    question_no: q.no,
    kind: q.kind,
    version_a: q.kind === 'compare' ? q.a : q.node,
    version_b: q.kind === 'compare' ? q.b : null,
    choice: 'choice' in a ? a.choice : null,
    times: 'times' in a ? a.times : null,
    share: 'share' in a ? a.share : null,
  })}`;
  return { ok: true };
}

/**
 * Every juror's latest answer per question for a character, with jurors numbered 1, 2, … in the order they were added
 * (never their FIDs), for the runner and the published results.
 */
export async function answersByNumber(sql: Sql, character: string): Promise<JurorAnswer[]> {
  const jurors = await sql`select fid from studio.deep_funding_jurors where challenge = ${CHALLENGE.id} and character = ${character} order by added_at, id`;
  const no = new Map(jurors.map((r, i) => [Number(r.fid), i + 1]));
  const rows = await sql`
    select distinct on (fid, question_no) fid, kind, version_a, version_b, choice, times, share
    from studio.juror_answers where challenge = ${CHALLENGE.id} and character = ${character}
    order by fid, question_no, answered_at desc, id desc`;
  return rows
    .filter((r) => no.has(Number(r.fid)))
    .map((r): JurorAnswer =>
      r.kind === 'compare'
        ? { juror: no.get(Number(r.fid))!, character, kind: 'compare', a: String(r.version_a), b: String(r.version_b), choice: r.choice as 'a' | 'b', times: Number(r.times) }
        : { juror: no.get(Number(r.fid))!, character, kind: 'originality', node: String(r.version_a), share: Number(r.share) },
    )
    .sort((x, y) => x.juror - y.juror);
}
