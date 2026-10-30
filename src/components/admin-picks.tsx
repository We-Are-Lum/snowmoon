'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PickOption } from '~/lib/pick-options';
import type { Pick } from '~/lib/picks';
import { PICK_LABEL, PickSwitch } from './pick-switch';

/**
 * Admin picks in the reader (owner, 2026-10-29; principle 5): for a chapter's moments, or the References cards, that
 * have an admin's pick. Each shows the picked image first, labelled with PICK_LABEL ("Picked by @…"), with the reader's
 * PickSwitch beside it. The seeded image it stands in for is set aside while the pick shows (it stays one tap away in
 * the switch). Moments and terms with no pick are untouched. Fetched after the page is shown, so the page itself stays
 * as it was; nothing here orders anything but the switch.
 */
type Shown = { target: string; pick: Pick; options: PickOption[] };

function useAdminPicks(url: string) {
  const [shown, setShown] = useState<{ adminPick: Shown; host: HTMLElement }[]>([]);
  useEffect(() => {
    let alive = true;
    const made: HTMLElement[] = [];
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<{ picks: Shown[] }>) : { picks: [] }))
      .then(({ picks }) => {
        if (!alive) return;
        const out: { adminPick: Shown; host: HTMLElement }[] = [];
        for (const adminPick of picks) {
          const host = document.createElement('div');
          host.className = 'admin-pick';
          host.setAttribute('aria-label', PICK_LABEL(adminPick.pick.by));
          if (adminPick.pick.targetKind === 'moment') {
            const block = document.getElementById(adminPick.target);
            if (!block) continue;
            const seed = document.querySelector<HTMLElement>(`figure.seed-image[data-for="${adminPick.target}"]`);
            if (seed) seed.hidden = true;
            (seed ?? block).after(host);
          } else {
            const card = document.querySelector<HTMLElement>(`li.ref-card[data-term="${adminPick.target}"]`);
            if (!card) continue;
            card.prepend(host);
          }
          made.push(host);
          out.push({ adminPick, host });
        }
        setShown(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
      for (const h of made) h.remove();
      document.querySelectorAll<HTMLElement>('figure.seed-image[hidden]').forEach((f) => (f.hidden = false));
    };
  }, [url]);
  return shown;
}

export function ChapterPicks({ chapter }: { chapter: number }) {
  const shown = useAdminPicks(`/api/admin/picks?chapter=${chapter}`);
  return <>{shown.map(({ adminPick, host }) => createPortal(<PickSwitch pick={adminPick.pick} options={adminPick.options} />, host, adminPick.target))}</>;
}

export function ReferencePicks() {
  const shown = useAdminPicks('/api/admin/picks?terms=1');
  return <>{shown.map(({ adminPick, host }) => createPortal(<PickSwitch pick={adminPick.pick} options={adminPick.options} />, host, adminPick.target))}</>;
}
