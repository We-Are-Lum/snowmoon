import type { Metadata } from 'next';
import { MomentPage, momentMetadata, type MomentParams } from '../../../../../moment-page';

/** /@<fname>/<id>/m/<shot>: one moment, every version side by side (rewritten here by next.config.ts). */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<MomentParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return momentMetadata(await params);
}

export default async function Moment({ params }: Props) {
  return <MomentPage p={await params} />;
}
