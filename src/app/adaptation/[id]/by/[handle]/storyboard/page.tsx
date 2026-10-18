import type { Metadata } from 'next';
import type { SceneParams } from '../../../../scene-page';
import { StoryboardRoute, storyboardMetadata } from '../../../../editor/routes';
import '../../../../editor/editor.css';
import '../../../../../remix/remix.css';

/**
 * /@<fname>/<id>/storyboard: making a storyboard from that person's chosen version (rewritten here by
 * next.config.ts; src/app/adaptation/editor/routes.tsx). The frames and lines come from the version's
 * committed files; the draft stays in the browser until it is saved (POST /api/remix/storyboard).
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<SceneParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return storyboardMetadata(await params);
}

export default async function StoryboardPage({ params }: Props) {
  return <StoryboardRoute p={await params} />;
}
