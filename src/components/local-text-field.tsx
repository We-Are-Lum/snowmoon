'use client';

import { useId } from 'react';

/**
 * A text box in the live shot editor (the prompt, a line): what the visitor types stays in this
 * browser. It is never saved, sent anywhere or published by the site, and it says so
 * (check:principles P1f). Wording DRAFTED by the coding agent (2026-10-17; the fork file removed,
 * owner 2026-10-18).
 */
export function LocalTextField({ id, label, value, onChange, rows = 3 }: { id: string; label: React.ReactNode; value: string; onChange: (v: string) => void; rows?: number }) {
  const note = useId();
  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={note} />
      <p id={note} className="ed-help">
        Kept in this browser only. Never saved, sent or published by this site.
      </p>
    </>
  );
}
