import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { NothingHere, loadScene, type SceneParams } from '../../../../../scene-page';
import { ShotEditor } from '../../../../../editor/shot-editor';
import { EDITOR_PROTOTYPE_URL } from '~/lib/config';
import { editorVersion } from '~/lib/adaptation-pages';
import '../../../../../editor/editor.css';
import '../../../../../../remix/remix.css';

/**
 * /@<fname>/<id>/shot/<shot>: the live shot editor for that person's chosen version (rewritten here
 * by next.config.ts). Read and play only: the shot's data comes from the version's committed files
 * (public/editor/<id>/v<n>/, made by scripts/editor-data.mjs), so a preview without the production
 * database and any remix show the same editor.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<SceneParams & { shot: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const s = await loadScene(p);
  if (s.kind !== 'scene') return { title: 'Nothing here yet', robots: { index: false } };
  return { title: `Shot ${decodeURIComponent(p.shot)} · ${s.adaptation.title} · @${s.handle}`, robots: { index: false } };
}

export default async function ShotPage({ params }: Props) {
  const p = await params;
  const shot = decodeURIComponent(p.shot);
  if (!/^[\w-]{1,40}$/.test(shot)) notFound();
  const s = await loadScene(p);
  if (s.kind === 'redirect') redirect(`${s.to.replace(/-[a-z0-9-]*$/, '')}/shot/${shot}`);
  if (s.kind === 'not-found') notFound();
  if (s.kind === 'hidden') return <NothingHere />;
  if (s.kind === 'nothing') return <NothingHere title={s.adaptation.title} handle={s.handle} />;
  const scenePath = `/@${s.handle}/${s.adaptation.id}`;
  // The version whose committed shots the editor reads (version 2, the GPT cut, reads version 1's), and its label.
  const ed = await editorVersion(s.version);
  return (
    <ShotEditor
      dataUrl={`/editor/${s.adaptation.id}/v${ed.id}/data.json`}
      shotId={shot}
      handle={s.handle}
      scenePath={scenePath}
      aiLabel={ed.recipe.ai_label ?? null}
      prototypeUrl={EDITOR_PROTOTYPE_URL}
    />
  );
}
