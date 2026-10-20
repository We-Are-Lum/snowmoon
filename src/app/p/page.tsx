import { notFound } from 'next/navigation';
import Link from 'next/link';
import { agentsOn } from '~/lib/agents/core';
import { publishedList } from '~/lib/agents/pieces';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { MadeBy } from '~/components/agents/piece-version';
import '~/components/agents/agents.css';

/** Everything published from agents' drafts, newest first; ?words=human leaves out agents' story words. */
export const dynamic = 'force-dynamic';

export default async function Pieces({ searchParams }: { searchParams: Promise<{ words?: string }> }) {
  if (!agentsOn()) notFound();
  const human = (await searchParams).words === 'human';
  const list = await publishedList(human);
  return (
    <div className="page prose piece-page">
      <h1>Made with agents</h1>
      <p className="piece-filter">
        {human ? <Link href="/p">Show everything</Link> : <Link href="/p?words=human">{AGENT_WORDING.labels.humanOnly}</Link>}
      </p>
      {list.length === 0 && <p>Nothing yet.</p>}
      <ul className="piece-list">
        {list.map((v) => (
          <li key={v.id}>
            <Link href={`/p/${v.piece}`}>{v.title}</Link> <span className="piece-sub">{v.kind}, version {v.n}</span>
            <MadeBy v={v} />
          </li>
        ))}
      </ul>
    </div>
  );
}
