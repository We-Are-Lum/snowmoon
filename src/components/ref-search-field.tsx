'use client';

import type { KeyboardEvent } from 'react';

/**
 * The reference picker's two boxes (owner's request via Garance, 2026-11-21; src/components/chapter-pictures.tsx): a
 * search (maker, character or words) and a pasted snowmoon.party link. Admins only. What is typed is sent to our server
 * to find a published picture and is never published or kept; only the picture picked is (its version id goes with
 * Make). It says so under each box, as the other text boxes do (check:principles P1f). Reread by the owner 2026-11-21.
 */
export const REF_FIELD_LINE = 'Sent to us to find a published picture. Never published or kept.';

export function RefSearchField({ id, label, kind, value, onChange, onEnter, placeholder }: { id: string; label: string; kind: 'search' | 'url'; value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string }) {
  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <label className="cp-field" htmlFor={id}>
      <span className="you-meta">{label}</span>
      {kind === 'search' ? (
        <input id={id} type="search" autoComplete="off" spellCheck={false} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={enter} aria-describedby={`${id}-line`} />
      ) : (
        <input id={id} type="url" inputMode="url" autoComplete="off" spellCheck={false} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={enter} aria-describedby={`${id}-line`} />
      )}
      <span id={`${id}-line`} className="you-meta cp-ref-line">
        {REF_FIELD_LINE}
      </span>
    </label>
  );
}
