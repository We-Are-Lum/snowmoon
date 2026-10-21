import type { Metadata } from 'next';
import type { SceneParams } from '../../../../../scene-page';
import { ShotRoute, shotMetadata } from '../../../../../editor/routes';
import '../../../../../editor/editor.css';
import '../../../../../../remix/remix.css';

/**
 * /@<fname>/<id>/shot/<shot>: the live shot editor for that person's chosen version (rewritten here
 * by next.config.ts; src/app/adaptation/editor/routes.tsx). A fixed version's is /@<fname>/<id>/v/<n>/shot/<shot>.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<SceneParams & { shot: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return shotMetadata(await params);
}

export default async function ShotPage({ params }: Props) {
  return <ShotRoute p={await params} />;
}
