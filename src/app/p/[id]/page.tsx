import { notFound } from 'next/navigation';
import Link from 'next/link';
import { agentsOn } from '~/lib/agents/core';
import { notesOn, pieceVersions } from '~/lib/agents/pieces';
import { PieceVersion } from '~/components/agents/piece-version';
import { PieceFeedback } from '~/components/agents/piece-feedback';
import { handleFor } from '~/lib/adaptation-pages';
import '~/components/agents/agents.css';

/** A piece's public page: its published versions, newest last, each with its labels, credits and notes. */
export const dynamic = 'force-dynamic';

export default async function Piece({ params }: { params: Promise<{ id: string }> }) {
  if (!agentsOn()) notFound();
  const { id } = await params;
  const versions = (await pieceVersions(id, null)).filter((v) => v.status === 'published');
  if (!versions.length) notFound();
  const notes = await notesOn(versions.map((v) => v.id));
  const latest = versions[versions.length - 1];
  return (
    <div className="page prose piece-page">
      <p className="crumb"><Link href="/p">← Made with agents</Link></p>
      <h1>{latest.title}</h1>
      {versions.map((v) => (
        <PieceVersion key={v.id} v={v} notes={notes.filter((n) => n.version === v.id)} imageSrc={v.image ? `/api/pieces/image/${v.id}` : null} />
      ))}
      <PieceFeedback on={latest.id} ownerHandle={(await handleFor(latest.person)) ?? ''} />
    </div>
  );
}
