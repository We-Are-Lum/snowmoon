'use client';

import { forwardRef } from 'react';

/**
 * A search box for the book's own text ("Make an image", /images/new): never published, never
 * saved, never sent: the page searches the text served whole by GET /api/book/text on the device. It says so
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
          {hint ? `${hint} ` : ''}Searched on your device, in the book’s own text. Your search is not sent anywhere. Never published.
        </p>
      </div>
    );
  },
);
