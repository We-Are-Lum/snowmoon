'use client';

import { useState } from 'react';
import { useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';
import { openComposer } from '~/lib/images/client';
import { ADMIN_ADD_LABEL, addEntry, type AddEntry } from '~/lib/images/add-entry';
import { AdminAddSheet } from './reader-picture-admin';

/**
 * The reader's "add an image" buttons (the selection menu, the player, "+ Add an image"), for one chapter (owner,
 * 2026-11-20): for an admin, #196's "Add a picture here" sheet with the passage set; for anyone else, the readers'
 * composer, as before. `open(start, end)` does the right one; `sheet` is the admin's sheet while it is open; `label`
 * names the button (the admins' words for an admin, the button's own words otherwise).
 */
export function useAddImageEntry(chapter: number) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [open, setOpen] = useState<Extract<AddEntry, { kind: 'admin' }> | null>(null);
  return {
    admin,
    open(start: number, end: number) {
      const e = addEntry(admin, chapter, start, end);
      if (e.kind === 'admin') setOpen(e);
      else openComposer({ chapter: e.chapter, start: e.start, end: e.end });
    },
    label: (readers: string) => (admin ? ADMIN_ADD_LABEL : readers),
    sheet: open ? <AdminAddSheet chapter={open.chapter} after={open.after} start={open.start} end={open.end} onClose={() => setOpen(null)} /> : null,
  };
}
