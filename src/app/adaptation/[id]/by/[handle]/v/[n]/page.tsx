import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NothingHere, ScenePage, followScene, loadScene, sceneMetadata, type SceneParams } from '../../../../../scene-page';

/** /@<fname>/<id>/v/<n>: one fixed version (rewritten here by next.config.ts). */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<SceneParams & { n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sceneMetadata(await params);
}

export default async function FixedScene({ params }: Props) {
  const s = await loadScene(await params);
  if (s.kind === 'redirect') followScene(s);
  if (s.kind === 'not-found') notFound();
  if (s.kind === 'hidden') return <NothingHere />;
  if (s.kind === 'nothing') return <NothingHere title={s.adaptation.title} handle={s.handle} />;
  return <ScenePage adaptation={s.adaptation} version={s.version} handle={s.handle} fixed />;
}
