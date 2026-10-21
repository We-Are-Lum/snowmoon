import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '~/lib/db';
import { appUrl } from '~/lib/config';
import { getAdaptation, getVersion, handleFor, ownMedia } from '~/lib/adaptation-pages';
import { boardById, boardFrames } from '~/lib/remix/storyboards';
import { HideButton, ShareRow } from '../../remix/remix-actions';
import { BoardView } from '../board-view';
import '../../remix/remix.css';

/**
 * /storyboard/<id>: a saved storyboard (owner, 2026-10-18), for anyone with the link: played as a
 * slideshow with the version's voices and mix, its title and maker, Share (link and cast composer),
 * and Hide for its maker or the maintainer.
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const sql = db();
  if (!sql) return null;
  const b = await boardById(sql, id).catch(() => null);
  if (!b) return null;
  const [adaptation, version, frames] = await Promise.all([getAdaptation(b.adaptationId), getVersion(b.versionId), boardFrames(sql, b)]);
  const handle = version ? await handleFor(version.author) : null;
  const by = b.byName ? (b.person < 0 ? b.byName : `@${b.byName}`) : b.person > 0 ? `FID ${b.person}` : 'a wallet account';
  return { b, title: adaptation?.title ?? 'a scene', version, handle, frames, by };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await load((await params).id);
  if (!l || l.b.hidden) return { title: 'Storyboard', robots: { index: false } };
  return { title: `${l.b.title || 'A storyboard'} · ${l.title} · ${l.by}`, robots: { index: false } };
}

export default async function BoardPage({ params }: Props) {
  const { id } = await params;
  const l = await load(id);
  if (!l) notFound();
  const { b, title, version, handle, frames, by } = l;
  const scenePath = handle ? `/@${handle}/${b.adaptationId}` : `/${b.adaptationId}`;
  if (b.hidden)
    return (
      <main className="rx">
        <p className="label">Storyboard</p>
        <h1 className="rx-title">Hidden</h1>
        <p>{b.hiddenRole === 'maker' ? 'Its maker hid this storyboard.' : 'The maintainer hid this storyboard.'}</p>
        <HideButton id={b.id} base="/api/remix/storyboard" />
      </main>
    );
  const seconds = b.items.reduce((n, i) => n + i.seconds, 0);
  return (
    <main className="rx">
      <p className="label rx-kicker">
        A storyboard of {title}, version {b.versionId} · by {by}
      </p>
      <h1 className="rx-title">{b.title || 'Untitled storyboard'}</h1>
      <p className="label rx-kicker">
        {b.items.length} frames · {seconds.toFixed(1)} s
      </p>
      <BoardView
        dataUrl={`/editor/${b.adaptationId}/v${b.versionId}/data.json`}
        items={b.items}
        takes={b.takes}
        frames={frames}
        by={by}
        mixUrl={ownMedia(version?.recipe.video_url)}
        aiLabel={version?.recipe.ai_label ?? null}
      />
      <ShareRow url={`${appUrl()}/storyboard/${b.id}`} text={`${b.title || 'A storyboard'}: ${title}, remixed`} />
      <HideButton id={b.id} base="/api/remix/storyboard" />
      <p>
        <Link href={`${scenePath}/storyboard`}>Make your own storyboard</Link> · <Link href={scenePath}>Watch {title}</Link>
      </p>
    </main>
  );
}
