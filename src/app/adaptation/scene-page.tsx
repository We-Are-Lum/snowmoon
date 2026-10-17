import { cache } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_NAME, REPO_URL, adaptationPagesShown, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';
import { type Adaptation, type Version, getAdaptation, getVersion, handleFor, ownMedia, parseId, resolveHandle, shownVersion } from '~/lib/adaptation-pages';
import { SceneActions } from '~/components/scene-actions';
import './scene.css';

/**
 * The scene page behind /@<fname>/<id> and /@<fname>/<id>/v/<n> (next.config.ts rewrites those
 * to /adaptation/<id>/by/<fname>[/v/<n>]). Design: docs/proposals/adaptation-urls.md.
 */

export type SceneParams = { id: string; handle: string; n?: string };

export type Scene =
  | { kind: 'not-found' }
  | { kind: 'hidden' }
  | { kind: 'redirect'; to: string }
  | { kind: 'nothing'; adaptation: Adaptation; handle: string }
  | { kind: 'scene'; adaptation: Adaptation; version: Version; handle: string; fixed: boolean };

/** Everything the page and its metadata need, looked up once per request. */
export const loadScene = cache(async ({ id: idSeg, handle: raw, n }: SceneParams): Promise<Scene> => {
  if (!adaptationPagesShown()) return { kind: 'hidden' };
  const id = parseId(idSeg);
  if (id === null) return { kind: 'not-found' };
  const adaptation = await getAdaptation(id);
  if (!adaptation) return { kind: 'not-found' };
  const who = await resolveHandle(raw);
  if (who.kind === 'none') return { kind: 'not-found' };
  const tail = n === undefined ? idSeg : `${id}/v/${n}`;
  if (who.kind === 'redirect') return { kind: 'redirect', to: `/@${who.handle}/${tail}` };

  if (n === undefined) {
    const version = await shownVersion(who.person, id);
    return version ? { kind: 'scene', adaptation, version, handle: who.handle, fixed: false } : { kind: 'nothing', adaptation, handle: who.handle };
  }
  if (!/^\d{1,9}$/.test(n)) return { kind: 'not-found' };
  const version = await getVersion(Number(n));
  if (!version || version.adaptationId !== id) return { kind: 'not-found' };
  if (version.author !== who.person) {
    // A fixed link always lives under its author's current name (it survives a rename).
    const author = await handleFor(version.author);
    return author ? { kind: 'redirect', to: `/@${author}/${id}/v/${version.id}` } : { kind: 'not-found' };
  }
  if (version.hidden) return { kind: 'nothing', adaptation, handle: who.handle };
  return { kind: 'scene', adaptation, version, handle: who.handle, fixed: true };
});

export async function sceneMetadata(params: SceneParams): Promise<Metadata> {
  const s = await loadScene(params);
  if (s.kind !== 'scene' && s.kind !== 'nothing') return { title: 'Nothing here yet', robots: { index: false } };
  const path = s.kind === 'scene' && s.fixed ? `/@${s.handle}/${s.adaptation.id}/v/${s.version.id}` : `/@${s.handle}/${s.adaptation.id}`;
  const url = `${appUrl()}${path}`;
  const image = (s.kind === 'scene' && ownMedia(s.version.recipe.poster_url)) || `${appUrl()}/embed.png`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: image,
    button: {
      title: 'Watch it',
      action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  const title = `${s.adaptation.title} · @${s.handle}`;
  return {
    title,
    alternates: { canonical: path },
    openGraph: { title, images: [{ url: image }] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export function NothingHere({ title, handle }: { title?: string; handle?: string }) {
  return (
    <div className="page prose scene-nothing">
      {title && <h1>{title}</h1>}
      <p>Nothing here yet.</p>
      {handle && title && <p className="label">@{handle} has no version of this to show.</p>}
      <p>
        <Link href="/">Back to the book</Link>
      </p>
    </div>
  );
}

export function ScenePage({ adaptation, version, handle, fixed }: { adaptation: Adaptation; version: Version; handle: string; fixed: boolean }) {
  const latestPath = `/@${handle}/${adaptation.id}`;
  const fixedPath = `${latestPath}/v/${version.id}`;
  const host = appUrl().replace(/^https?:\/\//, '');
  const video = ownMedia(version.recipe.video_url);
  const poster = ownMedia(version.recipe.poster_url) ?? undefined;
  const r = version.recipe;

  return (
    <div className="scene">
      <section className="scene-top" aria-label="The scene">
        <div className="scene-watch">
          {video ? (
            <video className="scene-video" src={video} poster={poster} controls preload="metadata" playsInline aria-label={`${adaptation.title}, version ${version.id}`} />
          ) : (
            <div className="scene-video scene-video-empty" role="img" aria-label="The video is not published yet">
              <span>The video is not published yet.</span>
            </div>
          )}
          <div className="scene-under label">
            <span>
              Version {version.id} · {version.createdAt}
              {version.parentId !== null && ` · forked from version ${version.parentId}`}
            </span>
            {r.ai_label && <span>{r.ai_label}</span>}
          </div>
        </div>

        <div className="scene-side">
          <div className="scene-head">
            <span className="label scene-where">
              {fixed ? (
                <>
                  {host}
                  {fixedPath} · this version, fixed
                </>
              ) : (
                <>
                  {host}
                  {latestPath} · @{handle}&rsquo;s chosen version
                </>
              )}
            </span>
            {r.after_chapter && <span className="label scene-muted">A scene after chapter {r.after_chapter}</span>}
            <h1 className="scene-title">{adaptation.title}</h1>
            {r.spoilers_through && <span className="label scene-muted">Spoilers through chapter {r.spoilers_through}</span>}
          </div>

          <dl className="scene-facts">
            <div>
              <dt className="label">Book</dt>
              <dd>
                <i>Snowmoon</i>, Vitalik Buterin
              </dd>
            </div>
            <div>
              <dt className="label">Adaptation</dt>
              <dd>@{handle}</dd>
            </div>
            <div>
              <dt className="label">Licence</dt>
              <dd>GPL-3.0</dd>
            </div>
            <div>
              <dt className="label">Recipe</dt>
              <dd>{r.recipe_url ? <a href={r.recipe_url}>Read it</a> : 'Not published yet'}</dd>
            </div>
          </dl>

          <SceneActions
            handle={handle}
            title={adaptation.title}
            latestUrl={`${appUrl()}${latestPath}`}
            fixedUrl={`${appUrl()}${fixedPath}`}
            forkUrl={`${REPO_URL}#how-to-fork`}
          />
          {fixed && (
            <p className="label">
              <Link className="scene-latest" href={latestPath}>
                See @{handle}&rsquo;s latest chosen version
              </Link>
            </p>
          )}
        </div>
      </section>

      <p className="provenance scene-provenance">
        Snowmoon by Vitalik Buterin, GPL v3. An independent adaptation, not affiliated with the author.
      </p>
    </div>
  );
}
