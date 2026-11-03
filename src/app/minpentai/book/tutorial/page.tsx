import { AGENTS } from '~/lib/config';
import { Tutorial } from './tutorial';
import '../book.css';

export const metadata = { title: 'Rocks and Mirrors: the four pieces (draft)', robots: { index: false } };

/**
 * Rocks and Mirrors' tutorial (owner, 2026-11-01): one short card per piece, each played on a small board from the
 * sandbox scenarios (versions/book-scenarios.ts). Opened from /minpentai/book and a match's live page. Invite-only,
 * like the book page.
 */
export default function RocksAndMirrorsTutorial() {
  return (
    <div className="page minpentai">
      <Tutorial people={[...AGENTS.minpentaiPlay.people]} />
    </div>
  );
}
