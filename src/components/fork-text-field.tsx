'use client';

import { useId } from 'react';

/**
 * A text box in the live shot editor (the prompt, a line): what the visitor types stays in this
 * browser and goes only into the fork.json they save on their own device. It is never sent
 * anywhere or published by the site, and it says so (check:principles P1f). Wording DRAFTED by the
 * coding agent (2026-10-17).
 */
export function ForkTextField({ id, label, value, onChange, rows = 3 }: { id: string; label: React.ReactNode; value: string; onChange: (v: string) => void; rows?: number }) {
  const note = useId();
  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={note} />
      <p id={note} className="ed-help">
        Kept on this device, only in your fork file. Never sent or published by this site.
      </p>
    </>
  );
}
