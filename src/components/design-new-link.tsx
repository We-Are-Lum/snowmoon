'use client';

import Link from 'next/link';
import { useCanAddImage } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';

/** "+ New {name} sheet": for invited readers during the trial, like "Add an image". */
export function NewSheetLink({ slug, name }: { slug: string; name: string }) {
  const canAdd = useCanAddImage();
  if (!canAdd) return null;
  return (
    <Link className="dz-new" href={`/images/designs/new?kind=character&character=${slug}`}>
      + {IMAGE_WORDING.designs.form.newSheet(name)}
    </Link>
  );
}
