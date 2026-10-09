import Link from 'next/link';
import { IMAGES } from '~/lib/config';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { MyPicks } from '~/components/my-picks';

export const metadata = { title: 'My picks', robots: { index: false } };

/** My picks (step 4; Claude Design 6 and 6-desktop): private, read in the browser for the signed-in person only. */
export default function PicksPage() {
  return (
    <div className="page prose dz-page dz-picks-page">
      <p className="label ip-crumb">
        <Link href="/images/designs">← {IMAGE_WORDING.designs.index.title}</Link> · {IMAGES.label}
      </p>
      <h1 className="dz-title">{IMAGE_WORDING.designs.picks.title}</h1>
      <MyPicks />
    </div>
  );
}
