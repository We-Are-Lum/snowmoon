import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { adaptationPagesShown } from '~/lib/config';
import { resolveHandle } from '~/lib/adaptation-pages';
import { AiLabel } from '~/components/recipe-sheet';
import { frameView, labelFor, pictureView, posterAlt, posterView } from '~/lib/scene-posters';
import { hasPublicWork, publicWork, whoIs } from '~/lib/you';
import { MadeBy } from '~/components/agents/piece-version';
import '../../dashboard/you.css';
import '~/components/agents/agents.css';

/**
 * /@<handle> (rewritten here by next.config.ts): a person's public profile (owner, 2026-10-18; 2026-10-29:
 * "Public profile at /@<fname>, matching /@<fname>/<id> for adaptations: published work only"), which
 * bylines link to. Public, and only what is already public at its own link: each scene as /@<handle>/<id>
 * shows it, their published pictures (each at /image/<id>), remix frames and storyboards that aren't hidden
 * (while PROFILE_LISTS_REMIXES allows), and published agent pieces (while /p is public). Never a prompt
 * beyond what each item's own page shows, their balance, a draft, or anything hidden. /@<handle>/<id>
 * (one scene) is a different route and isn't touched.
 *
 * The handle resolves as on scene pages (src/lib/adaptation-pages.ts resolveHandle): a Farcaster name
 * (other spellings and old names redirect), or a wallet account's full address. A wallet account with
 * nothing published gets the same "not found" as an address that never signed in, so the page doesn't
 * tell anyone which addresses have used the site.
 *
 * Not indexed by search engines, like remix frames and storyboards (robots noindex): the page gathers
 * them, but finding them stays by link. All wording here is DRAFT wording for the owner.
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ handle: string }> };

const load = cache(async (raw: string) => {
  if (!adaptationPagesShown()) return { kind: 'none' as const };
  const who = await resolveHandle(raw);
  if (who.kind === 'none') return { kind: 'none' as const };
  if (who.kind === 'redirect') return { kind: 'redirect' as const, to: `/@${who.handle}` };
  const [name, work] = await Promise.all([whoIs(who.person), publicWork(who.person, who.handle)]);
  const empty = !hasPublicWork(work);
  if (empty && who.person < 0) return { kind: 'none' as const };
  return { kind: 'profile' as const, handle: who.handle, person: who.person, name, work, empty };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await load((await params).handle);
  if (l.kind !== 'profile') return { title: 'Not found', robots: { index: false } };
  return { title: `${l.name.name} · published work`, robots: { index: false, follow: true }, alternates: { canonical: `/@${l.handle}` } };
}

export default async function Profile({ params }: Props) {
  const l = await load((await params).handle);
  if (l.kind === 'redirect') redirect(l.to);
  if (l.kind !== 'profile') notFound();
  const { name, work } = l;
  const by = name.name;
  return (
    <main className="you you-profile">
      <p className="label you-kicker">Published on Snowmoon</p>
      <h1 className="you-title">{by}</h1>
      {name.kind === 'wallet' && name.address && <p className="you-meta you-addr">{name.address}</p>}
      {name.kind === 'farcaster' && name.fid && <p className="you-meta">Farcaster ID {name.fid}</p>}
      {l.empty && <p className="you-note">Nothing published yet.</p>}

      {work.scenes.length > 0 && (
        <section className="you-section" aria-labelledby="p-scenes">
          <h2 id="p-scenes">Scenes</h2>
          <ul className="you-scenes">
            {work.scenes.map((s) => (
              <li key={s.adaptationId} className="you-scene">
                {s.poster && (
                  <figure className="you-fig">
                    <Link href={s.latestPath}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.poster} alt={posterAlt(s.versionId, s.title)} width={640} height={360} />
                    </Link>
                    <figcaption>
                      <AiLabel kind="image" text={labelFor(by)} view={posterView({ id: s.versionId, adaptationId: s.adaptationId, createdAt: s.createdAt, recipe: { ai_label: s.aiLabel, recipe_url: s.recipeUrl } }, s.title, by)} />
                    </figcaption>
                  </figure>
                )}
                <p className="you-item-title">
                  <Link href={s.latestPath}>{s.title}</Link>
                </p>
                <p className="you-meta">
                  Version {s.versionId} · {s.createdAt}
                  {s.parentId !== null && ` · remixed from version ${s.parentId}`}
                </p>
                {s.aiLabel && <p className="you-meta">{s.aiLabel}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {work.pictures.length > 0 && (
        <section className="you-section" aria-labelledby="p-pictures">
          <h2 id="p-pictures">Pictures</h2>
          <ul className="you-frames">
            {work.pictures.map((p) => (
              <li key={p.versionId}>
                <figure className="you-fig">
                  <Link href={`/image/${p.versionId}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`AI-generated image for chapter ${p.chapter}, published by ${by}`} width={512} height={288} loading="lazy" />
                  </Link>
                  <figcaption>
                    <AiLabel kind="image" text={labelFor(by)} view={pictureView({ versionId: p.versionId, by, prompt: p.prompt, chapter: p.chapter, at: p.createdAt })} />
                  </figcaption>
                </figure>
                <p className="you-meta">
                  <Link href={`/image/${p.versionId}`}>Chapter {p.chapter}</Link> · {p.createdAt.slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {work.pieces.length > 0 && (
        <section className="you-section" aria-labelledby="p-pieces">
          <h2 id="p-pieces">Made with agents</h2>
          <ul className="piece-list">
            {work.pieces.map((v) => (
              <li key={v.id}>
                <Link href={`/p/${v.piece}`}>{v.title}</Link> <span className="piece-sub">{v.kind}, version {v.n}</span>
                <MadeBy v={v} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {work.frames.length > 0 && (
        <section className="you-section" aria-labelledby="p-frames">
          <h2 id="p-frames">Remix frames</h2>
          <ul className="you-frames">
            {work.frames.map((f) => (
              <li key={f.id}>
                {f.url && (
                  <figure className="you-fig">
                    <Link href={`/remix/${f.id}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={`A remix of shot ${f.shot}, made by ${by}: ${f.words}`} width={512} height={288} loading="lazy" />
                    </Link>
                    <figcaption>
                      <AiLabel kind="image" text={labelFor(by)} view={frameView({ id: f.id, by, title: f.title, shot: f.shot, versionId: f.versionId, words: f.words, at: f.createdAt, model: f.model })} />
                    </figcaption>
                  </figure>
                )}
                <p className="you-meta">
                  <Link href={`/remix/${f.id}`}>
                    {f.title}, shot {f.shot}
                  </Link>{' '}
                  · {f.createdAt.slice(0, 10)}
                </p>
                <p className="you-words">{f.words}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {work.boards.length > 0 && (
        <section className="you-section" aria-labelledby="p-boards">
          <h2 id="p-boards">Storyboards</h2>
          <ul className="you-list">
            {work.boards.map((b) => (
              <li key={b.id} className="you-item you-item-text">
                <div className="you-item-body">
                  <p className="you-item-title">
                    <Link href={`/storyboard/${b.id}`}>{b.title || 'Untitled storyboard'}</Link>
                  </p>
                  <p className="you-meta">
                    {b.frames} frame{b.frames === 1 ? '' : 's'} · {b.seconds.toFixed(1)} s · {b.sceneTitle}, version {b.versionId} · {b.createdAt.slice(0, 10)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="you-note you-profile-foot">
        Everything here is public at its own link, and its maker can hide it at any time.
      </p>
    </main>
  );
}
