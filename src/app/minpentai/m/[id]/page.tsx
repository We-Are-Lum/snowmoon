import { notFound } from 'next/navigation';
import { playFor } from '~/lib/agents/core';
import { draftInfo, linkOpens, turnFrames, turnSummaries, viewFor } from '~/lib/minpentai/agent-play/solo';
import { load } from '~/lib/minpentai/agent-play/store';
import { settle } from '~/lib/minpentai/agent-play/quiet';
import { MinpentaiTags } from '../../mp-tags';
import { Refresh } from './refresh';
import { LiveTop } from './live-top';
import { PastTurns } from './past-turns';
import '../../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: your side', robots: { index: false }, referrer: 'no-referrer' as const };

const WHO: Record<string, string> = { person: 'you', agent: 'your AI', 'site-computer': 'the site computer', autopilot: 'your AI (autopilot)' };
const PRESET: Record<string, string> = { balanced: 'balanced', defend: 'defend', attack: 'attack', expand: 'expand' };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type Move = { piece: string; x: number; y: number; dir?: string; slant?: string };
/** A turn's placements in a few words: "tower, 2 gliders E". */
const brief = (ps: Move[]) => {
  if (!ps.length) return 'nothing placed';
  const n = new Map<string, number>();
  for (const p of ps) { const k = `${p.piece.replace(/_/g, ' ')}${p.dir ? ` ${p.dir}` : ''}`; n.set(k, (n.get(k) ?? 0) + 1); }
  return [...n].map(([k, c]) => (c > 1 ? `${c} ${k.replace(/^(\S+)/, '$1s')}` : k)).join(', ');
};

/**
 * A person's live link to their agent-play match (owner, 2026-11-01: "good to watch on a phone while my AI plays"): their
 * side only (solo.ts viewFor, the same view their AI gets). Laid out for a phone (owner, 2026-11-03): this turn at the
 * top, in one screen (the board with the AI's draft, then the replay in place; points and cost, lane warnings, Take
 * turn, the replay's controls, the last turn's summary); past turns below, one line each; links at the bottom. Never the
 * other side's board or orders while the match is on. The secret is in ?k=; a wrong or missing secret, a missing match
 * and someone else's read the same (404).
 */
export default async function LiveLink({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params, { k } = await searchParams;
  const peek = await load(id).catch(() => null);
  if (!peek || !playFor(peek.m.person) || !linkOpens(peek.m, k ?? '')) notFound();
  // The same quiet time as every tool call (quiet.ts): the page's timing says nothing about the computer's planning.
  const r = (await settle(id)) ?? peek;
  const m = r.m, v = viewFor(m), end = m.end;
  const draft = draftInfo(m);
  const book = m.ruleset.startsWith('book');
  const latestTurn = m.history.at(-1)?.turn;
  const sums = turnSummaries(m);
  const last = v.my_turns.at(-1);
  const status = end
    ? `Over at step ${end.step}: ${end.win === 'C' ? 'you won' : end.win === 'A' ? 'the site computer won' : 'a draw'}${end.how === 'resigned' ? ' (resigned)' : ''}.`
    : `Turn ${v.turn}${v.phase === 'setup' ? ' (setup)' : ''} · step ${v.step}/${v.max_steps} · you (Cyan) v the site computer, level ${v.opponent.level}`;
  const tally = 'towers_destroyed' in v && v.towers_destroyed ? `destroyed ${v.towers_destroyed.by_you}–${v.towers_destroyed.by_opponent}` : null;
  const past = v.my_turns.filter((t) => t.turn !== latestTurn).reverse().map((t) => ({
    turn: t.turn, step: t.step, line: brief(t.placements as Move[]), kills: sums.find((x) => x.turn === t.turn)?.kills ?? 0,
    who: `${WHO[t.source] ?? t.source}${'taken_on_the_live_page' in t && t.taken_on_the_live_page ? `, on this page (drafted by ${WHO[t.drafted_by ?? ''] ?? t.drafted_by})` : ''}`,
    summary: sums.find((x) => x.turn === t.turn)?.lines ?? [],
  }));
  return (
    <div className="page minpentai">
      <article className="mb mb-live">
        <h1 className="mb-live-title">{book ? 'Rocks and Mirrors' : 'Minpentai'}: your side</h1>
        <LiveTop
          matchId={m.id} width={v.board_size.width} height={v.board_size.height} status={status} tally={tally}
          current={{ board: v.board, canPlace: v.can_place, lastSeen: v.last_seen_enemy_towers, marks: last ? last.placements : [] }}
          draft={draft && !draft.final ? { placements: draft.placements, cost: draft.cost, points: draft.points, warnings: draft.warnings, note: draft.note, who: cap(WHO[draft.source] ?? draft.source) } : null}
          canTake={!end} turn={v.turn} points={v.points}
          latest={latestTurn !== undefined ? { turn: latestTurn, frames: turnFrames(m, latestTurn, !!end), whole: !!end } : null}
          summary={v.last_turn_summary?.lines ?? null}
        />
        <PastTurns matchId={m.id} secret={k ?? ''} width={v.board_size.width} height={v.board_size.height} whole={!!end} items={past} />
        <footer className="mb-live-foot">
          <p className="mb-note">Standing order: {v.standing_order ? <>&ldquo;{v.standing_order.text}&rdquo; ({PRESET[v.standing_order.preset]})</> : 'none, so if the site computer plays a turn for you, it plays balanced'}.</p>
          {!end ? <p className="mb-note">Only your side is shown while the match is on: what your towers see, and where you last saw the enemy&rsquo;s. The site computer&rsquo;s moves follow from the board and its random value, committed at the start ({v.opponent.random_commitment.slice(0, 12)}…); anyone can check them after the end.</p> : null}
          <p className="mb-live-links">
            <a href={book ? '/minpentai/book' : '/minpentai/rules'}>Rules</a>
            {book ? <> · <a href="/minpentai/book/tutorial">How the pieces work</a></> : null}
          </p>
          <MinpentaiTags tags={['rules', 'draft']} />
          <p className="mb-note">Rules invented for this edition{book ? ', drawn from passages in the book' : ''} · not affiliated with the author.</p>
        </footer>
        {!end ? <Refresh seconds={5} /> : null}
      </article>
    </div>
  );
}
