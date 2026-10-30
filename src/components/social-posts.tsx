import { postsLinkingTo } from '~/lib/social/read';
import { SocialPostsView } from './social-posts-view';

/**
 * "Posts that link here" (branch social-read, owner 2026-10-29): public posts on Farcaster and Bluesky that link to
 * this page, newest first (the only order; P5f), after the page's own content and apart from it. Each shows the
 * network, the author's handle, the date, the post's text as a quotation and a link to the post. Nothing from either
 * network loads in the browser: no avatar, picture, embed or script (P6a); the text is plain. Shows nothing while
 * SOCIAL_READ.show is off, before the hide list exists, or when no post links here.
 */
export async function SocialPosts({ page }: { page: string }) {
  const posts = await postsLinkingTo(page).catch(() => []);
  return <SocialPostsView posts={posts} />;
}
