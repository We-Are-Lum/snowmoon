import Link from 'next/link';
import { IMAGE_WORDING } from '~/lib/images/wording';

/**
 * Pictures' four choices (owner, 2026-10-14: "moments, characters, settings, and styles easily
 * clear and accessible"): the same menu on the front page and on each choice's page, the one
 * shown marked. On a phone, two by two.
 */
export type PicturesChoice = 'moments' | 'characters' | 'settings' | 'styles';

const HREF: Record<PicturesChoice, string> = {
  moments: '/images?show=moments',
  characters: '/images/designs?tab=characters',
  settings: '/images/designs?tab=places',
  styles: '/images/designs',
};

export function PicturesMenu({ current }: { current: PicturesChoice | null }) {
  return (
    <nav className="pictures-menu" aria-label="Pictures">
      {IMAGE_WORDING.feed.menu.map((c) => (
        <Link key={c.key} href={HREF[c.key]} aria-current={current === c.key ? 'page' : undefined}>
          <span className="pictures-menu-label">{c.label}</span>
          <span className="pictures-menu-hint">{c.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
