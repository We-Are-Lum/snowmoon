import { cache } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_NAME, adaptationPagesShown, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';
import { type Adaptation, type Version, editorVersion, getAdaptation, getVersion, handleFor, ownMedia, parseId, resolveHandle, shownVersion, titleSlug } from '~/lib/adaptation-pages';
import { deliveryFor, posterFor } from '~/lib/scene-delivery';
import { ShotStrip } from './editor/shot-strip';
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
  // Words after the id redirect to the current title's (owner, 2026-10-17); a bare id stays bare.
  const words = `${id}-${titleSlug(adaptation.title)}`;
  if (n === undefined && decodeURIComponent(idSeg) !== String(id) && decodeURIComponent(idSeg) !== words) {
    return { kind: 'redirect', to: `/@${who.handle}/${words}` };
  }

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

/**
 * Share images made for one adaptation (owner, 2026-10-18): the Farcaster embed (3:2) and the link preview
 * (1200 × 630), on its owner's scene page and that page's version and slug URLs. Every other adaptation keeps
 * its poster card.
 */
const SHARE_IMAGES: Record<number, { handle: string; embed: string; og: string }> = {
  1: { handle: 'naaate', embed: '/share/fifteen-days-embed-3x2.png', og: '/share/fifteen-days-og-1200x630.png' },
};

export async function sceneMetadata(params: SceneParams): Promise<Metadata> {
  const s = await loadScene(params);
  if (s.kind !== 'scene' && s.kind !== 'nothing') return { title: 'Nothing here yet', robots: { index: false } };
  const path = s.kind === 'scene' && s.fixed ? `/@${s.handle}/${s.adaptation.id}/v/${s.version.id}` : `/@${s.handle}/${s.adaptation.id}`;
  const url = `${appUrl()}${path}`;
  const image = (s.kind === 'scene' && posterFor(ownMedia(s.version.recipe.video_url), ownMedia(s.version.recipe.poster_url))) || `${appUrl()}/embed.png`;
  const share = SHARE_IMAGES[s.adaptation.id]?.handle === s.handle ? SHARE_IMAGES[s.adaptation.id] : null;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: share ? `${appUrl()}${share.embed}` : image,
    button: {
      title: 'Watch it',
      action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  const title = `${s.adaptation.title} · @${s.handle}`;
  return {
    title,
    alternates: { canonical: path },
    openGraph: { title, images: share ? [{ url: `${appUrl()}${share.og}`, width: 1200, height: 630 }] : [{ url: image }] },
    ...(share ? { twitter: { card: 'summary_large_image' as const, images: [`${appUrl()}${share.og}`] } } : {}),
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

/** A handle (or a link holding one) inside a capitals label: a wallet address stays lowercase, as it is typed (owner, 2026-10-17). */
function Handle({ handle, text }: { handle: string; text?: string }) {
  const shown = text ?? `@${handle}`;
  return /^0x/.test(handle) ? <span className="scene-addr">{shown}</span> : <>{shown}</>;
}

export function NothingHere({ title, handle }: { title?: string; handle?: string }) {
  return (
    <div className="page prose scene-nothing">
      {title && <h1>{title}</h1>}
      <p>Nothing here yet.</p>
      {handle && title && (
        <p className="label">
          <Handle handle={handle} /> has no version of this to show.
        </p>
      )}
      <p>
        <Link href="/">Back to the book</Link>
      </p>
    </div>
  );
}

export async function ScenePage({ adaptation, version, handle, fixed }: { adaptation: Adaptation; version: Version; handle: string; fixed: boolean }) {
  const latestPath = `/@${handle}/${adaptation.id}`;
  const fixedPath = `${latestPath}/v/${version.id}`;
  const host = appUrl().replace(/^https?:\/\//, '');
  const video = ownMedia(version.recipe.video_url);
  const poster = posterFor(video, ownMedia(version.recipe.poster_url)) ?? undefined;
  const delivery = deliveryFor(video);
  const r = version.recipe;
  // The live editor, the shot strip and Remix read a version's committed pictures; a version whose pictures
  // aren't committed here shows another's, and says so (src/lib/adaptation-pages.ts editorVersion; none now).
  const ed = await editorVersion(version);
  const otherShots = ed.id !== version.id;
  // A fixed link's editor is that version's own (/@<name>/<id>/v/<n>/shot/<shot>); the chosen version's is /@<name>/<id>/shot/<shot>.
  const editorPath = fixed ? fixedPath : latestPath;

  return (
    <div className="scene">
      <section className="scene-top" aria-label="The scene">
        <div className="scene-watch">
          {video ? (
            delivery ? (
              // The same cut, packaged to start sooner (src/lib/scene-delivery.ts); the cut itself is the last source.
              <video className="scene-video" poster={poster} controls preload="metadata" playsInline aria-label={`${adaptation.title}, version ${version.id}`} data-cut={video}>
                <source src={delivery.phone} type="video/mp4" media="(max-width: 800px)" />
                <source src={delivery.wide} type="video/mp4" />
                <source src={video} type="video/mp4" />
              </video>
            ) : (
              <video className="scene-video" src={video} poster={poster} controls preload="metadata" playsInline aria-label={`${adaptation.title}, version ${version.id}`} />
            )
          ) : (
            <div className="scene-video scene-video-empty" role="img" aria-label="The video is not published yet">
              <span>The video is not published yet.</span>
            </div>
          )}
          <div className="scene-under label">
            <span>
              Version {version.id} · {version.createdAt}
              {version.parentId !== null && ` · remixed from version ${version.parentId}`}
            </span>
            {/* The AI label stays in sight, short; its full wording and the recipe open from it (owner, 2026-10-18: "too much text"). */}
            <details className="scene-ai">
              <summary>
                {/* Owner's wording, 2026-10-19: the model, its maker, that it is closed and "not by the author", in sight. */}
                AI pictures: {r.closed_model ? `${r.closed_model.name.replace(/\s+\d.*$/, '')} (${r.closed_model.maker}, closed model), ` : ''}not by the author{' '}
                <span className="scene-ai-icon" aria-hidden="true">i</span>
              </summary>
              <div className="scene-ai-body">
                {r.ai_label && <p>{r.ai_label}</p>}
                {r.closed_model && (
                  // A closed model is named with its maker, the date and that it is closed (owner, 2026-10-18). DRAFT wording.
                  <p className="scene-closed">
                    Inputs open, model closed: {r.closed_model.made} by {r.closed_model.name} ({r.closed_model.maker}, a closed model), {r.closed_model.date}.
                  </p>
                )}
                <p>
                  {/* On the site (owner, 2026-10-18: no GitHub in the flow): every shot's recipe, in the editor. */}
                  <Link href={`${editorPath}/shot/first#recipe`}>{otherShots ? `Version ${ed.id}\u2019s shots and recipes, in the editor` : 'Read the recipe'}</Link>
                </p>
              </div>
            </details>
          </div>
        </div>

        <div className="scene-side">
          <div className="scene-head">
            <span className="label scene-where">
              {fixed ? (
                <>
                  <Handle handle={handle} text={`${host}${fixedPath}`} /> · this version, fixed
                </>
              ) : (
                <>
                  <Handle handle={handle} text={`${host}${latestPath}`} /> · <Handle handle={handle} />&rsquo;s chosen version
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
              <dd>
                {/* The byline links to the person's public profile (owner, 2026-10-18). */}
                <Link href={`/@${handle}`}>
                  <Handle handle={handle} />
                </Link>
              </dd>
            </div>
            <div>
              <dt className="label">Licence</dt>
              <dd>GPL-3.0</dd>
            </div>
          </dl>

          <SceneActions
            handle={handle}
            title={adaptation.title}
            latestUrl={`${appUrl()}${latestPath}`}
            fixedUrl={`${appUrl()}${fixedPath}`}
            remixUrl={`${editorPath}/shot/first`}
            remixNote={otherShots ? `The editor has version ${ed.id}\u2019s shots for now.` : undefined}
          />
          {fixed && (
            <p className="label">
              <Link className="scene-latest" href={latestPath}>
                See <Handle handle={handle} />&rsquo;s latest chosen version
              </Link>
            </p>
          )}
        </div>
      </section>

      <ShotStrip
        dataUrl={`/editor/${adaptation.id}/v${ed.id}/data.json`}
        scenePath={editorPath}
        heading={otherShots ? `Version ${ed.id}\u2019s shots, open-weight pictures \u00b7 open one in the live editor` : undefined}
      />

      <p className="provenance scene-provenance">
        Snowmoon by Vitalik Buterin, GPL v3. An independent adaptation, not affiliated with the author.
      </p>
    </div>
  );
}
