'use client';

import { forwardRef } from 'react';

/**
 * A search box for the book's own text ("Make an image", /images/new): never published, never
 * saved, sent only to this site's search (GET /api/book/search), which keeps nothing. It says so
 * under the box, as PublishedTextField and PrivateTextField do (npm run check:principles P1f
 * checks this wording). Model-drafted wording.
 */
export const SearchField = forwardRef<HTMLInputElement, { id: string; label: string; value: string; onChange: (v: string) => void; maxLength?: number; hint?: string }>(
  function SearchField({ id, label, value, onChange, maxLength, hint }, ref) {
    return (
      <div className="search-field">
        <label className="mi-h" htmlFor={id}>
          {label}
        </label>
        <input ref={ref} id={id} type="search" value={value} maxLength={maxLength} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
        <p id={`${id}-line`} className="mi-note">
          {hint ? `${hint} ` : ''}Searched on this site’s server, in the book’s own text. Not kept by this site. Never published.
        </p>
      </div>
    );
  },
);
