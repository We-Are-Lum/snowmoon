import type { Metadata } from 'next';
import { db } from '~/lib/db';
import { designByVersion } from '~/lib/images/designs';
import { NO_PREVIEW } from '~/lib/challenge/landing';

/**
 * A hidden, unpublished or missing version's page answers 404, and its 404 must give no preview picture at all
 * (owner, 2026-11-04): not the version's, and not the site's own "Read Snowmoon" embed either, which the root layout
 * gives every other page. A page's own metadata is dropped when it answers 404, so this segment's layout says it.
 * For a published version the page's own metadata (src/app/references/designs/[id]/page.tsx) replaces this.
 */
type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const sql = db();
  const d = sql ? await designByVersion(sql, (await params).id).catch(() => null) : null;
  return d ? {} : NO_PREVIEW;
}

export default function DesignVersionLayout({ children }: Props) {
  return children;
}
