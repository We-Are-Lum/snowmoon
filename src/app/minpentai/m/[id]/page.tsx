import { notFound } from 'next/navigation';
import { playFor } from '~/lib/agents/core';
import { linkOpens, recordOf, viewFor } from '~/lib/minpentai/agent-play/solo';
import { load } from '~/lib/minpentai/agent-play/store';
import { MinpentaiTags } from '../../mp-tags';
import { Refresh } from './refresh';
import { ViewBoard } from './view-board';
import '../../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: your side', robots: { index: false }, referrer: 'no-referrer' as const };

const WHO: Record<string, string> = { person: 'you', agent: 'your AI', 'site-computer': 'the site computer', autopilot: 'your AI (autopilot)' };
const PRESET: Record<string, string> = { balanced: 'balanced', defend: 'defend', attack: 'attack', expand: 'expand' };
type Move = { piece: string; x: number; y: number; dir?: string; slant?: string };
const say = (p: Move) => `${p.piece.replace(/_/g, ' ')} at ${p.x},${p.y}${p.dir ? `, ${p.piece === 'factory' ? 'firing' : 'flying'} ${p.dir}` : ''}${p.slant ? `, leaning ${p.slant}` : ''}`;

/**
 * A person's live link to their agent-play match (owner, 2026-11-01: "good to watch on a phone while my AI plays"): their
 * side only (solo.ts viewFor, the same view their AI gets), the last turn's moves outlined on the board with who chose
 * each, this turn's orders, and the standing order in effect. Never the other side's board or orders while the match is
 * on. The secret is in ?k=; a wrong or missing secret, a missing match and someone else's read the same (404).
 */
export default async function LiveLink({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params, { k } = await searchParams;
  const r = await load(id).catch(() => null);
  if (!r || !playFor(r.m.person) || !linkOpens(r.m, k ?? '')) notFound();
  const m = r.m, v = viewFor(m);
  const end = m.end ? recordOf(m) : null;
  const last = v.my_turns[v.my_turns.length - 1];
  const book = m.ruleset.startsWith('book');
  return (
    <div className="page minpentai">
      <article className="mb mb-live">
        <p className="mb-status">
          {v.phase === 'over'
            ? `Over at step ${m.end!.step}: ${m.end!.win === 'C' ? 'you won' : m.end!.win === 'A' ? 'the site computer won' : 'a draw'}.`
            : `Step ${v.step} of ${v.max_steps} · turn ${v.turn}${v.phase === 'setup' ? ' (setup)' : ''}`}
        </p>
        <h1>{book ? 'Rocks and Mirrors' : 'Minpentai'}: your side</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        {end ? (
          <>
            <h2>The whole board at the end</h2>
            <ViewBoard board={end.final_position} width={v.board_size.width} height={v.board_size.height} />
          </>
        ) : (
          <ViewBoard board={v.board} width={v.board_size.width} height={v.board_size.height} canPlace={v.can_place} lastSeen={v.last_seen_enemy_towers} marks={last ? last.placements : []} />
        )}
        <p className="mb-note">You are Cyan, against the site computer (level {v.opponent.level}). Only your side is shown while the match is on: what your towers see, and where you last saw the enemy&rsquo;s.{book ? <> <a href="/minpentai/book/tutorial">How the pieces work →</a></> : null}</p>

        <h2>Last turn</h2>
        {last ? (
          <>
            <p>Turn {last.turn}, step {last.step}: chosen by <strong>{WHO[last.source] ?? last.source}</strong>{last.preset ? ` (standing order: ${PRESET[last.preset] ?? last.preset})` : ''}. Outlined on the board.</p>
            <ul className="mb-moves">{last.placements.length ? last.placements.map((p, i) => <li key={i}>{say(p as Move)}<span className="mb-who">{WHO[last.source] ?? last.source}</span></li>) : <li>Nothing placed.</li>}</ul>
          </>
        ) : <p>No turn played yet.</p>}

        {!end ? (
          <>
            <h2>This turn</h2>
            {v.my_orders ? (
              <>
                <p>Orders in: chosen by <strong>{WHO[v.my_orders.source] ?? v.my_orders.source}</strong>{v.my_orders.final ? ', final' : ', not final yet'}.</p>
                <ul className="mb-moves">{v.my_orders.placements.length ? v.my_orders.placements.map((p, i) => <li key={i}>{say(p as Move)}</li>) : <li>Nothing placed.</li>}</ul>
                {v.my_orders.note ? <p className="mb-note">Note: {v.my_orders.note}</p> : null}
              </>
            ) : <p>No orders yet. {v.points} points to place.</p>}
            <p className="mb-note">The site computer has committed its orders ({v.opponent_commitment?.slice(0, 12)}…); they are revealed with yours.</p>
          </>
        ) : null}

        <h2>Standing order</h2>
        <p>{v.standing_order ? <>&ldquo;{v.standing_order.text}&rdquo; <span className="mb-who">{PRESET[v.standing_order.preset]}</span></> : 'None: if the site computer plays a turn for you, it plays balanced.'}</p>

        <h2>All your turns</h2>
        <ol>{v.my_turns.map((t) => <li key={t.turn}>Step {t.step}: {t.placements.map((p) => say(p as Move)).join('; ') || 'nothing'} <span className="mb-who">{WHO[t.source] ?? t.source}</span></li>)}</ol>
        <p className="mb-note">Rules invented for this edition{book ? ', drawn from passages in the book' : ''} · not affiliated with the author.</p>
        {!end ? <Refresh seconds={5} /> : null}
      </article>
    </div>
  );
}
