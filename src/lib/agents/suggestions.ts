import 'server-only';
import { ToolInputError } from '../agent/tools';
import { SYSTEM_FID } from '../config';
import { agentsTestOn, sql, type Agent } from './core';
import { agentLabel } from './accounts';
import { clock, momentOk } from './requests';

/**
 * "Suggest an improvement" (owner, 2026-10-22: "I want to make sure they can leave notes for how to make the
 * experience better"). An invited person says what would make the site better, typed or spoken (spoken ones
 * are transcribed, checked by the person and kept as words; the recording is never kept), from their Dashboard
 * or through their agent. Private to the owner, who reads them on their Dashboard with who said it and where
 * they were. A person's own agent can read that person's suggestions, nobody else's. Never published.
 */
export const suggestionsReader = (): number => (agentsTestOn() && /^-?\d+$/.test(process.env.AGENTS_TEST_OWNER ?? '') ? Number(process.env.AGENTS_TEST_OWNER) : SYSTEM_FID);

export interface SuggestionView {
  id: string;
  words: string;
  spoken: boolean;
  page: string | null;
  moment: string | null;
  at: string | null;
  filedBy: string | null;
  createdAt: string;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '');

export async function addSuggestion(person: number, words: unknown, spoken: boolean, where: { page?: unknown; moment?: unknown; seconds?: unknown }, agent?: Agent): Promise<string> {
  const text = clean(words);
  if (!text || text.length > 2000) throw new ToolInputError('Say or type 1 to 2,000 characters.');
  const page = typeof where.page === 'string' && /^\/[^\s]{0,299}$/.test(where.page) ? where.page : null;
  const moment = typeof where.moment === 'string' && momentOk(where.moment) ? where.moment : null;
  const seconds = moment && typeof where.seconds === 'number' && where.seconds >= 0 && where.seconds < 36000 ? Math.round(where.seconds * 100) / 100 : null;
  const [r] = await sql()<{ id: string }[]>`insert into studio.suggestions (person, body, spoken, page, moment, seconds, agent_id, agent_name)
    values (${person}, ${text}, ${spoken}, ${page}, ${moment}, ${seconds}, ${agent?.id ?? null}, ${agent?.name ?? null}) returning id`;
  return r.id;
}

type Row = { id: string; person: string; body: string; spoken: boolean; page: string | null; moment: string | null; seconds: string | null; agent_name: string | null; created_at: Date };
const view = (r: Row): SuggestionView => ({
  id: r.id,
  words: r.body,
  spoken: r.spoken,
  page: r.page,
  moment: r.moment,
  at: r.seconds === null ? null : clock(Number(r.seconds)),
  filedBy: r.agent_name,
  createdAt: new Date(r.created_at).toISOString(),
});

/** One person's own suggestions, newest first (for them and their agent). */
export async function suggestionsOf(person: number): Promise<SuggestionView[]> {
  const rows = await sql()<Row[]>`select id, person, body, spoken, page, moment, seconds, agent_name, created_at from studio.suggestions where person = ${person} order by created_at desc limit 100`;
  return rows.map(view);
}

/** Everyone's, for the owner only: who said it (their name here) and where they were. */
export async function allSuggestions(reader: number): Promise<(SuggestionView & { person: number; who: string })[]> {
  if (reader !== suggestionsReader()) return [];
  const rows = await sql()<Row[]>`select id, person, body, spoken, page, moment, seconds, agent_name, created_at from studio.suggestions order by created_at desc limit 200`;
  const who = new Map<number, string>();
  for (const p of new Set(rows.map((r) => Number(r.person)))) who.set(p, (await agentLabel(p, null)).label);
  return rows.map((r) => ({ ...view(r), person: Number(r.person), who: who.get(Number(r.person))! }));
}
