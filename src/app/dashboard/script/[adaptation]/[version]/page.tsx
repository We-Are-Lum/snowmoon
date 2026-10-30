import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ScriptPage } from '~/components/agents/script-page';
import { agentsOn } from '~/lib/agents/core';
import '../../../you.css';

/**
 * /dashboard/script/<adaptation>/<version>: the script page of a person's own scene version (owner, 2026-10-20). The
 * page as served holds nothing private: the script and notes are read in the browser from /api/direction, which
 * answers only for the version's author (and only the allowlisted people while agents are owner-only).
 */
export const metadata: Metadata = { title: 'Script', robots: { index: false, follow: false } };

export default async function Script({ params }: { params: Promise<{ adaptation: string; version: string }> }) {
  if (!agentsOn()) notFound();
  const { adaptation, version } = await params;
  if (!/^\d{1,6}$/.test(adaptation) || !/^\d{1,6}$/.test(version)) notFound();
  return <ScriptPage adaptation={Number(adaptation)} version={Number(version)} />;
}
