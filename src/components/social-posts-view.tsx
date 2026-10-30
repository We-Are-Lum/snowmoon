import { CONTACT_EMAIL } from '~/lib/config';
import { NETWORK_NAME, type SocialPost } from '~/lib/social/parse';

/** What SocialPosts renders (social-posts.tsx): plain, with no server code, so scripts/test-social-read.ts can render it. */
export function SocialPostsView({ posts }: { posts: SocialPost[] }) {
  if (!posts.length) return null;
  return (
    <section className="social-posts" aria-labelledby="social-posts-title" data-social-posts="">
      <h2 id="social-posts-title" className="label social-posts-title">
        Posts that link here
      </h2>
      <p className="social-posts-note">
        Public posts on Farcaster and Bluesky that link to this page, newest first. They are not part of this edition, and we
        don&apos;t check them. Wrote one and want it removed here? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <ol className="social-posts-list">
        {posts.map((p) => (
          <li key={`${p.network} ${p.id}`} className="social-post" data-network={p.network} data-post-id={p.id} data-at={p.at}>
            <p className="label social-post-meta">
              {NETWORK_NAME[p.network]} · @{p.handle} · <time dateTime={p.at}>{p.at.slice(0, 10)}</time>
            </p>
            {p.text && (
              <blockquote className="social-post-text" cite={p.url}>
                {p.text}
              </blockquote>
            )}
            <a className="label social-post-link" href={p.url} rel="nofollow noopener noreferrer ugc" target="_blank">
              See it on {NETWORK_NAME[p.network]}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
