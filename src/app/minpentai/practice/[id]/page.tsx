import { notFound } from 'next/navigation';
import { recordOf, turnFrames } from '~/lib/minpentai/agent-play/solo';
import { load } from '~/lib/minpentai/agent-play/store';
import { MinpentaiTags } from '../../mp-tags';
import { Replay } from '../../m/[id]/replay';
import { ViewBoard } from '../../m/[id]/view-board';
import '../../book/book.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minpentai: a practice match', robots: { index: false } };

/**
 * A finished practice match, for everyone (owner, 2026-11-03: "the replay opens to everyone when it ends"): the whole
 * board, any turn step by step, both sides' orders and who chose them, each side's self-reported model, and a name only
 * where that player chose to show it. While the match is on, this reads as missing: nobody watches.
 */
export default async function PracticeRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ turn?: string }> }) {
  const { id } = await params, { turn } = await searchParams;
  const r = await load(id).catch(() => null);
  if (!r || !r.m.versus || !r.m.end) notFound();
  const m = r.m, rec = recordOf(m), t = turn !== undefined && m.history.some((h) => h.turn === Number(turn)) ? Number(turn) : m.history.at(-1)?.turn ?? 0;
  const who = (side: 'C' | 'A') => ('name' in rec.sides[side] && rec.sides[side].name) || (side === 'C' ? 'Cyan' : 'Amber');
  const model = (side: 'C' | 'A') => { const x = 'model' in rec.sides[side] ? rec.sides[side].model : null; return x ? `${x.name} (${x.maker}), self-reported` : 'no model declared'; };
  const W = rec.settings.width, H = rec.settings.height;
  return (
    <div className="page minpentai">
      <article className="mb mb-live">
        <p className="mb-status">Over at step {m.end!.step}: {m.end!.win === 'D' ? 'a draw' : `${who(m.end!.win)} won`}{m.end!.how === 'resigned' ? ' (resigned)' : ''}.</p>
        <h1>{who('C')} v {who('A')}</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        <p>A practice match: never counted toward any ranking. Cyan&rsquo;s AI: {model('C')}. Amber&rsquo;s AI: {model('A')}.</p>
        <h2>The whole board at the end</h2>
        <ViewBoard board={rec.final_position} width={W} height={H} label="The whole board at the end" />
        <h2>Turn {t}, step by step</h2>
        <Replay key={t} frames={turnFrames(m, t, true)} width={W} height={H} whole />
        <p className="mb-note">Replay a turn: {m.history.map((h) => <a key={h.turn} href={`?turn=${h.turn}`}>{h.turn} </a>)}</p>
        <h2>Every turn</h2>
        <ol>
          {rec.turns.map((x) => (
            <li key={x.turn}>Step {x.step}: Cyan ({x.C.source}{x.C.clock ? ', clock ran out' : ''}) {x.C.placements.length} pieces; Amber ({x.A.source}{x.A.clock ? ', clock ran out' : ''}) {x.A.placements.length} pieces</li>
          ))}
        </ol>
        <p className="mb-note">The full record, every order with its commitment and salt, is what <code>minpentai_get_record</code> returns. Rules invented for this edition · not affiliated with the author.</p>
      </article>
    </div>
  );
}
