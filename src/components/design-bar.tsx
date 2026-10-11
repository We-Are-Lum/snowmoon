'use client';

import Link from 'next/link';
import { useAuth } from '~/lib/client-auth';
import { useCanAddImage, useCanMakeDesigns } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { ImageActions } from './image-actions';
import { PickButton } from './design-picks';

/**
 * The foot of a style or sheet page (Design 4a, 5a): "Use as my …" (2fr, filled) and Fork, as one
 * action bar; for its maker, New version. Then Report, or Hide this for the maker, through the
 * same report and hide path as images. Picking is for everyone signed in;
 * forking and new versions for invited readers, for now (owner, 2026-10-10).
 */
const W = IMAGE_WORDING.designs;

export function DesignBar(p: { versionId: string; versionNo: number; elementId: string; entityId: string; kind: 'style' | 'character'; name: string; byFid: number }) {
  const auth = useAuth();
  const canAdd = useCanAddImage();
  const canMake = useCanMakeDesigns();
  const mine = auth.kind === 'signed-in' && auth.fid === p.byFid;
  // A fragment, so the bar row is a child of the page's column and can stay at the foot on a phone.
  return (
    <>
      {canAdd && canMake && (
        <div className="dz-bar-row">
          <PickButton versionId={p.versionId} versionNo={p.versionNo} elementId={p.elementId} entityId={p.entityId} kind={p.kind} name={p.name} />
          {canMake && (
            <Link className="ic-secondary dz-fork" href={`/images/designs/new?from=${p.versionId}`}>
              {W.page.fork}
            </Link>
          )}
          {canMake && mine && (
            <Link className="ic-secondary dz-fork" href={`/images/designs/new?version=${p.versionId}`}>
              {W.page.newVersion}
            </Link>
          )}
        </div>
      )}
      <div className="dz-bar">
        <ImageActions versionId={p.versionId} byFid={p.byFid} chapter={0} design={p.kind === 'style' ? 'style' : 'sheet'} />
      </div>
    </>
  );
}
