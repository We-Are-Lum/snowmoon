import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { NothingHere, loadScene, type SceneParams } from '../../../../scene-page';
import { StoryboardEditor } from '../../../../editor/storyboard-editor';
import { ownMedia } from '~/lib/adaptation-pages';
import '../../../../editor/editor.css';
import '../../../../../remix/remix.css';

/**
 * /@<fname>/<id>/storyboard: making a storyboard from that person's chosen version (rewritten here by
 * next.config.ts). The frames and lines come from the version's committed files; the draft stays in the
 * browser until it is saved (POST /api/remix/storyboard).
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<SceneParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await loadScene(await params);
  return { title: s.kind === 'scene' ? `Storyboard · ${s.adaptation.title}` : 'Nothing here yet', robots: { index: false } };
}

export default async function StoryboardPage({ params }: Props) {
  const p = await params;
  const s = await loadScene(p);
  if (s.kind === 'redirect') redirect(`${s.to.replace(/-[a-z0-9-]*$/, '')}/storyboard`);
  if (s.kind === 'not-found') notFound();
  if (s.kind === 'hidden') return <NothingHere />;
  if (s.kind === 'nothing') return <NothingHere title={s.adaptation.title} handle={s.handle} />;
  return (
    <StoryboardEditor
      dataUrl={`/editor/${s.adaptation.id}/v${s.version.id}/data.json`}
      scenePath={`/@${s.handle}/${s.adaptation.id}`}
      aiLabel={s.version.recipe.ai_label ?? null}
      mixUrl={ownMedia(s.version.recipe.video_url)}
    />
  );
}
