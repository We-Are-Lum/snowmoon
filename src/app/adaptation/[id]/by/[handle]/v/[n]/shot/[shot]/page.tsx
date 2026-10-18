import type { Metadata } from 'next';
import type { SceneParams } from '../../../../../../../scene-page';
import { ShotRoute, shotMetadata } from '../../../../../../../editor/routes';
import '../../../../../../../editor/editor.css';
import '../../../../../../../../remix/remix.css';

/**
 * /@<fname>/<id>/v/<n>/shot/<shot>: the live shot editor for one fixed version, with that version's own frames
 * and labels (rewritten here by next.config.ts; src/app/adaptation/editor/routes.tsx).
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<SceneParams & { n: string; shot: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return shotMetadata(await params);
}

export default async function FixedShotPage({ params }: Props) {
  return <ShotRoute p={await params} />;
}
