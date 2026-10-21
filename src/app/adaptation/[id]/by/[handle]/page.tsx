import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { NothingHere, ScenePage, loadScene, sceneMetadata, type SceneParams } from '../../../scene-page';

/** /@<fname>/<id>[-slug]: that person's chosen version of adaptation <id> (rewritten here by next.config.ts). */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<SceneParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sceneMetadata(await params);
}

export default async function LatestScene({ params }: Props) {
  const s = await loadScene(await params);
  if (s.kind === 'redirect') redirect(s.to);
  if (s.kind === 'not-found') notFound();
  if (s.kind === 'hidden') return <NothingHere />;
  if (s.kind === 'nothing') return <NothingHere title={s.adaptation.title} handle={s.handle} />;
  return <ScenePage adaptation={s.adaptation} version={s.version} handle={s.handle} fixed={false} />;
}
