import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { NothingHere, loadScene, type SceneParams } from '../scene-page';
import { ShotEditor } from './shot-editor';
import { StoryboardEditor } from './storyboard-editor';
import { editorVersion, ownMedia } from '~/lib/adaptation-pages';

/**
 * The live editor's pages, for a person's chosen version (/@<fname>/<id>/shot/<shot>, /@<fname>/<id>/storyboard)
 * and for one fixed version (/@<fname>/<id>/v/<n>/shot/<shot>, /@<fname>/<id>/v/<n>/storyboard), so a fixed
 * link's editor keeps that version's own frames and labels (2026-10-18: the chosen version of adaptation 1 is
 * version 2, the GPT cut; version 1's fixed link keeps version 1's open-weight frames). Rewritten here by
 * next.config.ts. Read and play only: the shots come from the version's committed files (public/editor/<id>/v<n>/,
 * made by scripts/editor-data.mjs), so a preview without the production database and any remix show the same editor.
 */
type ShotParams = SceneParams & { shot: string };

/** Where the scene lives: the chosen version's page, or the fixed version's. */
const scenePathOf = (handle: string, id: number, fixed: boolean, n: number) => (fixed ? `/@${handle}/${id}/v/${n}` : `/@${handle}/${id}`);
/** A redirect target for the scene (a renamed handle, the canonical case) with the editor's own tail. */
const withTail = (to: string, tail: string) => `${to.replace(/-[a-z0-9-]*$/, '')}/${tail}`;

export async function shotMetadata(p: ShotParams): Promise<Metadata> {
  const s = await loadScene(p);
  if (s.kind !== 'scene') return { title: 'Nothing here yet', robots: { index: false } };
  return { title: `Shot ${decodeURIComponent(p.shot)} · ${s.adaptation.title}${s.fixed ? ` · version ${s.version.id}` : ''} · @${s.handle}`, robots: { index: false } };
}

export async function ShotRoute({ p }: { p: ShotParams }) {
  const shot = decodeURIComponent(p.shot);
  if (!/^[\w-]{1,40}$/.test(shot)) notFound();
  const s = await loadScene(p);
  if (s.kind === 'redirect') redirect(withTail(s.to, `shot/${shot}`));
  if (s.kind === 'not-found') notFound();
  if (s.kind === 'hidden') return <NothingHere />;
  if (s.kind === 'nothing') return <NothingHere title={s.adaptation.title} handle={s.handle} />;
  // The version whose committed shots the editor reads (itself, unless its pictures aren't committed here), and its labels.
  const ed = await editorVersion(s.version);
  return (
    <ShotEditor
      dataUrl={`/editor/${s.adaptation.id}/v${ed.id}/data.json`}
      shotId={shot}
      handle={s.handle}
      scenePath={scenePathOf(s.handle, s.adaptation.id, s.fixed, s.version.id)}
      aiLabel={ed.recipe.ai_label ?? null}
      closedModel={ed.recipe.closed_model ?? null}
    />
  );
}

export async function storyboardMetadata(p: SceneParams): Promise<Metadata> {
  const s = await loadScene(p);
  return { title: s.kind === 'scene' ? `Storyboard · ${s.adaptation.title}${s.fixed ? ` · version ${s.version.id}` : ''}` : 'Nothing here yet', robots: { index: false } };
}

export async function StoryboardRoute({ p }: { p: SceneParams }) {
  const s = await loadScene(p);
  if (s.kind === 'redirect') redirect(withTail(s.to, 'storyboard'));
  if (s.kind === 'not-found') notFound();
  if (s.kind === 'hidden') return <NothingHere />;
  if (s.kind === 'nothing') return <NothingHere title={s.adaptation.title} handle={s.handle} />;
  // The version whose committed shots and mix the storyboard reads.
  const ed = await editorVersion(s.version);
  return (
    <StoryboardEditor
      dataUrl={`/editor/${s.adaptation.id}/v${ed.id}/data.json`}
      scenePath={scenePathOf(s.handle, s.adaptation.id, s.fixed, s.version.id)}
      aiLabel={ed.recipe.ai_label ?? null}
      mixUrl={ownMedia(ed.recipe.video_url)}
    />
  );
}
