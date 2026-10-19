import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';
import { authorVersions, editorVersion, ownMedia, type Version } from '~/lib/adaptation-pages';
import { deliveryFor } from '~/lib/scene-delivery';
import { isShotId, momentShot, type MomentLine, type MomentShot } from '~/lib/moments';
import { NothingHere, loadScene, type SceneParams } from './scene-page';
import { MomentPlay } from './moment-play';
import './scene.css';
import './moment.css';

/**
 * /@<fname>/<id>/m/<shot>: one moment of an adaptation, every version of it side by side (owner,
 * 2026-10-19; rewritten here by next.config.ts). Read only for now: the frames, labels, words and the
 * cut's span come from each version's committed editor data. Readers' Remix frames are not gathered
 * here: consent own-words-v4 says a frame is public at its link, so listing everyone's frames of a shot
 * waits for v5, like the profile's listing.
 */
export type MomentParams = SceneParams & { shot: string };

type Column = { version: Version; edId: number; shot: MomentShot };

async function loadMoment(p: MomentParams) {
  const shotId = decodeURIComponent(p.shot);
  if (!isShotId(shotId)) return { kind: 'not-found' as const };
  const s = await loadScene({ id: p.id, handle: p.handle });
  if (s.kind === 'redirect') return { kind: 'redirect' as const, to: `${s.to.replace(/-[a-z0-9-]*$/, '')}/m/${shotId}` };
  if (s.kind !== 'scene') return { kind: s.kind };
  const versions = await authorVersions(s.version.author, s.adaptation.id);
  const columns: Column[] = [];
  for (const v of versions) {
    const ed = await editorVersion(v);
    const shot = momentShot(s.adaptation.id, ed.id, shotId);
    if (shot) columns.push({ version: v, edId: ed.id, shot });
  }
  if (!columns.length) return { kind: 'not-found' as const };
  return { kind: 'moment' as const, adaptation: s.adaptation, handle: s.handle, shotId, columns };
}

const path = (handle: string, id: number, shot: string) => `/@${handle}/${id}/m/${shot}`;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** The version's AI label, short (as under the scene's player). */
function aiShort(v: Version) {
  const c = v.recipe.closed_model;
  return `AI pictures: ${c ? `${c.name.replace(/\s+\d.*$/, '')} (${c.maker}, closed model), ` : ''}not by the author`;
}

export async function momentMetadata(p: MomentParams): Promise<Metadata> {
  const m = await loadMoment(p);
  if (m.kind !== 'moment') return { title: 'Nothing here yet', robots: { index: false } };
  const first = m.columns[0];
  const url = `${appUrl()}${path(m.handle, m.adaptation.id, m.shotId)}`;
  const image = first.shot.frame ? `${appUrl()}${first.shot.frame}` : `${appUrl()}/embed.png`;
  const title = `${m.adaptation.title}, moment ${first.shot.n} of ${first.shot.total} · @${m.handle}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: image,
    button: { title: 'See this moment', action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
  return {
    title,
    alternates: { canonical: path(m.handle, m.adaptation.id, m.shotId) },
    openGraph: { title, url, images: [{ url: image }] },
    twitter: { card: 'summary_large_image', title, images: [image] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

function Whose({ by }: { by: MomentLine['by'] }) {
  if (by?.kind === 'book' && by.cite) {
    const ch = /^c(\d+)-b\d+$/.exec(by.cite)?.[1];
    return ch ? <Link href={`/chapter/${ch}#${by.cite}`}>the book, {by.cite}</Link> : <>the book, {by.cite}</>;
  }
  if (by?.kind === 'person' && by.handle) return <>written by @{by.handle}{by.on ? `, ${by.on}` : ''}</>;
  return <>whose words: not recorded</>;
}

export async function MomentPage({ p }: { p: MomentParams }) {
  const m = await loadMoment(p);
  if (m.kind === 'redirect') redirect(m.to);
  if (m.kind === 'not-found') notFound();
  if (m.kind === 'hidden') return <NothingHere />;
  if (m.kind !== 'moment') return <NothingHere />;
  const { adaptation, handle, columns } = m;
  const first = columns[0].shot;
  const scene = `/@${handle}/${adaptation.id}`;

  return (
    <div className="scene moment">
      <header className="moment-head">
        <span className="label scene-muted">
          <Link href={scene}>{adaptation.title}</Link> · @{handle} · moment {first.n} of {first.total} · {clock(first.from)}–{clock(first.to)}
        </span>
        <h1 className="moment-title">Moment {first.n}</h1>
        {first.lines.length > 0 && (
          <ul className="moment-lines">
            {first.lines.map((l, i) => (
              <li key={i}>
                <span className="moment-speaker">{l.speaker}</span> {l.text}{' '}
                <span className="label scene-muted">
                  <Whose by={l.by} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="moment-versions" aria-label="Every version of this moment">
        {columns.map(({ version: v, shot }, i) => {
          const cut = ownMedia(v.recipe.video_url);
          const d = deliveryFor(cut);
          const sources = cut ? (d ? [{ src: d.phone, media: '(max-width: 800px)' }, { src: d.wide }, { src: cut }] : [{ src: cut }]) : [];
          return (
            <article key={v.id} className="moment-version">
              <p className="label">
                Version {v.id}
                {i === 0 ? ` · @${handle}’s chosen version` : ''}
              </p>
              {sources.length ? (
                <MomentPlay sources={sources} poster={shot.frame ?? undefined} from={shot.from} to={shot.to} label={`${adaptation.title}, version ${v.id}, moment ${shot.n}`} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                shot.frame && <img className="moment-video" src={shot.frame} alt={`Version ${v.id}, moment ${shot.n}`} />
              )}
              <p className="label scene-muted">{aiShort(v)}</p>
              {shot.openFrom && shot.openFrom !== v.id && (
                <p className="label">
                  <Link href={`/@${handle}/${adaptation.id}/v/${shot.openFrom}`}>Pictures redrawn from version {shot.openFrom}</Link>
                </p>
              )}
              <p className="label">
                <Link href={`/@${handle}/${adaptation.id}/v/${v.id}/shot/${shot.id}#recipe`}>This shot in the editor, with its recipe</Link>
              </p>
            </article>
          );
        })}
      </section>

      <nav className="moment-nav label" aria-label="Other moments">
        {first.prev ? <Link href={path(handle, adaptation.id, first.prev)}>← Moment {first.n - 1}</Link> : <span />}
        <Link href={scene}>The whole scene</Link>
        {first.next ? <Link href={path(handle, adaptation.id, first.next)}>Moment {first.n + 1} →</Link> : <span />}
      </nav>

      <p className="provenance scene-provenance">
        Snowmoon by Vitalik Buterin, GPL v3. An independent adaptation, not affiliated with the author.
      </p>
    </div>
  );
}
