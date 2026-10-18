import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '~/lib/db';
import { APP_NAME, appUrl } from '~/lib/config';
import { AI_DECLARED } from '~/lib/ai-declared';
import { getAdaptation, handleFor } from '~/lib/adaptation-pages';
import { frameById, type Frame } from '~/lib/remix/frames';
import { HideButton, ShareRow } from '../remix-actions';
import '../remix.css';

/**
 * /remix/<id>: one remix frame (owner, 2026-10-18), for anyone with the link. The frame with its AI
 * label, the maker's words with their name, its recipe in full (the model and licence, the seed and
 * request, every picture sent by sha256, the exact prompt), the shot it remixes, Share (link and cast
 * composer) and, for its maker or the maintainer, Hide. A hidden frame shows only that it is hidden.
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
const PAPER = '#f6f3ea';

async function load(id: string) {
  const sql = db();
  if (!sql) return null;
  const f = await frameById(sql, id).catch(() => null);
  if (!f) return null;
  const adaptation = await getAdaptation(f.adaptationId);
  const [v] = await sql`select author_person from studio.adaptation_versions where id = ${f.versionId}`;
  const handle = v ? await handleFor(Number(v.author_person)) : null;
  // The maker's public profile, which the byline links to (owner, 2026-10-18).
  const maker = await handleFor(f.person).catch(() => null);
  return { f, title: adaptation?.title ?? 'a scene', handle, maker };
}

const byline = (f: Frame) => (f.byName ? (f.person < 0 ? f.byName : `@${f.byName}`) : f.person > 0 ? `FID ${f.person}` : 'a wallet account');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = await load(id);
  if (!l || l.f.hidden) return { title: 'Remix frame', robots: { index: false } };
  const url = `${appUrl()}/remix/${id}`;
  const image = l.f.imageUrl.startsWith('http') ? l.f.imageUrl : `${appUrl()}${l.f.imageUrl}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: image,
    button: { title: 'See the remix', action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
  const title = `A remix of ${l.title}, shot ${String(l.f.recipe.shot && (l.f.recipe.shot as { n?: number }).n)} · ${byline(l.f)}`;
  return { title, robots: { index: false }, openGraph: { title, images: [{ url: image }] }, other: { 'fc:miniapp': embed, 'fc:frame': embed } };
}

export default async function RemixFramePage({ params }: Props) {
  const { id } = await params;
  const l = await load(id);
  if (!l) notFound();
  const { f, title, handle, maker } = l;
  const r = f.recipe as {
    model?: { name?: string; licence?: string; endpoint?: string; host?: string };
    seed?: number | null;
    request_id?: string | null;
    made_at?: string;
    size?: { width: number; height: number };
    shot?: { id: string; n: number; version_frame?: string | null };
    pictures?: { n: number; role: string; name: string; sent_sha256: string; width: number; height: number; made_from?: string | null }[];
    cost_usd?: number;
    test?: string;
  };
  // The shot in its own version's editor (a fixed link): a frame of version 1 opens version 1's frames, whatever the chosen version is.
  const shotPath = handle ? `/@${handle}/${f.adaptationId}/v/${f.versionId}/shot/${f.shotId}` : null;
  const who = byline(f);
  if (f.hidden)
    return (
      <main className="rx">
        <p className="label">Remix frame</p>
        <h1 className="rx-title">Hidden</h1>
        <p>{f.hiddenRole === 'maker' ? 'Its maker hid this frame.' : 'The maintainer hid this frame.'}</p>
        <HideButton id={f.id} />
        {shotPath && <Link href={shotPath}>Open the shot</Link>}
      </main>
    );
  return (
    <main className="rx">
      <p className="label rx-kicker">
        A remix of {title}, shot {r.shot?.n ?? f.shotId} · version {f.versionId}
      </p>
      <figure className="rx-fig">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.imageUrl} alt={`A remix of shot ${r.shot?.n ?? f.shotId}, made by ${who}: ${f.ownWords}`} width={r.size?.width ?? 1024} height={r.size?.height ?? 576} />
        <figcaption className="label">
          AI image · by {maker ? <Link href={`/@${maker}`}>{who}</Link> : who} · <span>{AI_DECLARED.image}</span>
        </figcaption>
      </figure>
      <section className="rx-words" aria-label="Their words">
        <p className="label">{who}&rsquo;s words</p>
        <blockquote>{f.ownWords}</blockquote>
      </section>
      <ShareRow url={`${appUrl()}/remix/${f.id}`} text={`A remix of ${title}, shot ${r.shot?.n ?? f.shotId}`} />
      <HideButton id={f.id} />
      {shotPath && (
        <p>
          <Link href={shotPath}>Open shot {r.shot?.n ?? f.shotId} in the live editor</Link>
        </p>
      )}
      <details className="rx-recipe" open>
        <summary className="label">The recipe: how this frame was made</summary>
        {r.test && <p className="rx-note">{r.test}</p>}
        <dl>
          <dt className="label">Model</dt>
          <dd>
            {r.model?.name} · {r.model?.licence} · on {r.model?.host} ({r.model?.endpoint})
          </dd>
          <dt className="label">Seed · request</dt>
          <dd>
            {r.seed ?? 'none'} · <code>{r.request_id ?? 'none'}</code>
          </dd>
          <dt className="label">Made</dt>
          <dd>
            {r.made_at?.slice(0, 16).replace('T', ' ')} UTC · ${(r.cost_usd ?? f.costUsd).toFixed(4)}
          </dd>
          <dt className="label">Output</dt>
          <dd>
            sha256 <code>{f.imageSha256}</code>
          </dd>
          <dt className="label">From</dt>
          <dd>
            version {f.versionId}&rsquo;s shot {f.shotId}
            {r.shot?.version_frame ? <> (its frame {r.shot.version_frame})</> : null}
          </dd>
        </dl>
        <p className="label">Pictures sent, in order</p>
        <ol className="rx-pics">
          {(r.pictures ?? []).map((p) => (
            <li key={p.n}>
              {p.n}. {p.role === 'layout' ? 'the live layout, as a depth map, from the camera they set' : p.role === 'card' ? `cast card: ${p.name}` : `plate: ${p.name}`} · {p.width}×{p.height} · sha256 <code>{p.sent_sha256}</code>
              {p.made_from ? (
                <>
                  {' '}
                  · from <code>{p.made_from}</code>
                </>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="label">The exact prompt sent</p>
        <p className="rx-prompt">{f.prompt}</p>
        <p className="rx-note">
          The shot&rsquo;s own prompt and the plate&rsquo;s sentence were drafted by the coding agent for this version. &ldquo;Changes for this remix&rdquo; are {who}&rsquo;s words, unchanged. Checked before it was made: the blocked-names list and the prompt check; then the host&rsquo;s safety checker.
        </p>
      </details>
    </main>
  );
}
