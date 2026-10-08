'use client';

import { useEffect, useRef, useState } from 'react';
import { REPO_URL } from '~/lib/config';
import type { RecipeView } from '~/lib/recipe-view';

/**
 * "Recipe": opens a sheet filled from the recipe file by a fixed template (GET /api/recipe;
 * src/lib/recipe-view.ts). No model writes or summarises anything here. Without JavaScript
 * the link goes straight to the file on GitHub. The sentences are the owner's (FID 6786, 2026-10-08).
 */
export function RecipeLink({ file, item, children = 'Recipe' }: { file: string; item?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLAnchorElement>(null);
  const href = file.startsWith('http') ? file : `${REPO_URL}/blob/main/${file}`;
  return (
    <>
      <a
        ref={opener}
        href={href}
        className="recipe-link"
        onClick={(e) => {
          if (file.startsWith('http')) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      {open && (
        <RecipeSheet
          file={file}
          item={item}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}

function RecipeSheet({ file, item, onClose }: { file: string; item?: string; onClose: () => void }) {
  const [view, setView] = useState<RecipeView | null>(null);
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams({ file, ...(item ? { item } : {}) });
    fetch(`/api/recipe?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<RecipeView>) : Promise.reject()))
      .then(setView, () => setFailed(true));
  }, [file, item]);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !sheet.current) return;
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button'));
      if (e.shiftKey && document.activeElement === items[0]) (e.preventDefault(), items[items.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === items[items.length - 1]) (e.preventDefault(), items[0].focus());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="recipe-sheet" data-wording="FID 6786" role="dialog" aria-modal="true" aria-labelledby="recipe-title">
        <div className="recipe-head">
          <p id="recipe-title" className="recipe-eyebrow">
            How this was made
          </p>
          <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {failed && <p>This recipe could not be read here. The full recipe is on GitHub.</p>}
        {!view && !failed && <p className="recipe-eyebrow">…</p>}
        {view && (
          <dl className="recipe-list">
            <dt>What this is</dt>
            <dd>{view.what}</dd>
            <dt>Model</dt>
            <dd>{view.model ? `${view.model.name}. Licence: ${view.model.licence || 'not recorded'}. It ran ${view.model.where}.` : 'None. No model was used for this file.'}</dd>
            {view.prompt && (
              <>
                <dt>{view.prompt.label}</dt>
                <dd>
                  <pre className="recipe-prompt">{view.prompt.text}</pre>
                </dd>
              </>
            )}
            {view.inputs.map((i) => (
              <div key={i.label} className="recipe-row">
                <dt>{i.label}</dt>
                <dd className="recipe-mono">{i.value}</dd>
              </div>
            ))}
            <dt>Published</dt>
            <dd>{view.published ? `By ${view.published.by}, ${view.published.when}.` : 'Not published in the reader by this recipe.'}</dd>
            <dt>Cost</dt>
            <dd>{view.cost}</dd>
            <dt>Licence of the result</dt>
            <dd>{view.resultLicence}</dd>
          </dl>
        )}
        <a className="recipe-github" href={view?.github ?? (file.startsWith('http') ? file : `${REPO_URL}/blob/main/${file}`)} target="_blank" rel="noopener noreferrer">
          Full recipe on GitHub →
        </a>
      </div>
    </div>
  );
}
