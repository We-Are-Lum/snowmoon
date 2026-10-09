'use client';

import Link from 'next/link';
import { useAuth } from '~/lib/client-auth';
import { useCanAddImage } from '~/lib/images/can-add';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { ImageActions } from './image-actions';
import { PickButton } from './design-picks';

/**
 * The foot of a style or sheet page (Design 4a, 5a): "Use as my …" (2fr, filled) and Fork, as one
 * action bar; for its maker, New version. Then Report, or Hide this for the maker, through the
 * same report and hide path as images. Forking and picking are for invited readers in the trial.
 */
const W = IMAGE_WORDING.designs;

export function DesignBar(p: { versionId: string; versionNo: number; elementId: string; entityId: string; kind: 'style' | 'character'; name: string; byFid: number }) {
  const auth = useAuth();
  const canAdd = useCanAddImage();
  const mine = auth.kind === 'signed-in' && auth.fid === p.byFid;
  return (
    <div className="dz-bar">
      {canAdd && (
        <div className="dz-bar-row">
          <PickButton versionId={p.versionId} versionNo={p.versionNo} elementId={p.elementId} entityId={p.entityId} kind={p.kind} name={p.name} />
          <Link className="ic-secondary dz-fork" href={`/images/designs/new?from=${p.versionId}`}>
            {W.page.fork}
          </Link>
          {mine && (
            <Link className="ic-secondary dz-fork" href={`/images/designs/new?version=${p.versionId}`}>
              {W.page.newVersion}
            </Link>
          )}
        </div>
      )}
      <ImageActions versionId={p.versionId} byFid={p.byFid} chapter={0} design={p.kind === 'style' ? 'style' : 'sheet'} />
    </div>
  );
}
