import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_NAME, CHALLENGE, appUrl } from '~/lib/config';
import { db } from '~/lib/db';
import { pictureView } from '~/lib/challenge/picture-view';
import { ChallengePicture } from '~/components/challenge-picture';

/**
 * A challenge picture's page, /challenge/p/<version> (branch challenge-moments, 2026-11-05; docs/proposals/
 * challenge-moments.md §1.3 S4–S5): the page people post. Its data comes from GET /api/challenge/picture. Once the
 * owner opens the challenge, its link preview shows the picture (Open Graph); until then it answers "not found", and
 * ./not-found.tsx shows admins the page in the browser.
 */
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  const { id } = await params;
  const sql = db();
  const v = sql && /^[0-9a-f-]{36}$/i.test(id) ? await pictureView(sql, id.toLowerCase()).catch(() => null) : null;
  if (!v) return { title: 'Not found', robots: { index: false } };
  const description = `${v.by}, on ${APP_NAME}. AI-generated picture, not by the author.`;
  return { title: v.title, description, robots: { index: false }, openGraph: { title: v.title, description, url: `${appUrl()}/challenge/p/${v.versionId}`, images: [{ url: v.url, alt: v.alt }] }, twitter: { card: 'summary_large_image', title: v.title, description, images: [v.url] } };
}

export default async function ChallengePicturePage({ params }: Props) {
  if (!CHALLENGE.public) notFound();
  const { id } = await params;
  return (
    <div className="page prose ch-page">
      <ChallengePicture id={id} />
    </div>
  );
}
