import type { Metadata } from 'next';
import type { SceneParams } from '../../../../../../scene-page';
import { StoryboardRoute, storyboardMetadata } from '../../../../../../editor/routes';
import '../../../../../../editor/editor.css';
import '../../../../../../../remix/remix.css';

/**
 * /@<fname>/<id>/v/<n>/storyboard: a storyboard from one fixed version, with that version's own frames
 * (rewritten here by next.config.ts; src/app/adaptation/editor/routes.tsx).
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<SceneParams & { n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return storyboardMetadata(await params);
}

export default async function FixedStoryboardPage({ params }: Props) {
  return <StoryboardRoute p={await params} />;
}
