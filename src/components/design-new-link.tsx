'use client';

import Link from 'next/link';
import { useCanMakeDesigns } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';

/** "+ New {name} sheet", a character's or a place's: for invited readers only, for now (owner, 2026-10-10). */
export function NewSheetLink({ kind, slug, name }: { kind: 'character' | 'location'; slug: string; name: string }) {
  const canMake = useCanMakeDesigns();
  if (!canMake) return null;
  return (
    <Link className="dz-new" href={kind === 'location' ? `/references/designs/new?kind=location&place=${slug}` : `/references/designs/new?kind=character&character=${slug}`}>
      + {IMAGE_WORDING.designs.form.newSheet(name)}
    </Link>
  );
}
