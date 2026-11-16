'use client';

import { InfoLabel } from './info-label';

/**
 * "Admin example" with its ⓘ (owner, 2026-11-12): an admin's picture submitted with its post, shown as an example and
 * never an entry. The word shows; the ⓘ opens the line saying why ("Not an entry: …"). Its words come from the server
 * (src/lib/challenge/wording.ts), so this script carries none of the challenge's.
 */
export function AdminExampleLabel({ label, info }: { label: string; info: string }) {
  return (
    <span className="ch-example" data-example="admin">
      <span className="ch-badge" aria-hidden="true">
        {label}
      </span>
      <InfoLabel word={label} kind="admin-example" declaration={info} title={label} body={[info]} />
    </span>
  );
}
