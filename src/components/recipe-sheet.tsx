'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REPO_URL } from '~/lib/config';
import { AI_DECLARED, AI_OPENS } from '~/lib/ai-declared';
import type { RecipeView } from '~/lib/recipe-view';

const githubHref = (file: string) => (file.startsWith('http') ? file : `${REPO_URL}/blob/main/${file}`);

/**
 * "Recipe": opens a sheet filled from the recipe file by a fixed template (GET /api/recipe;
 * src/lib/recipe-view.ts). No model writes or summarises anything here. Without JavaScript
 * the link goes straight to the file on GitHub. The sentences are the owner's (FID 6786, 2026-10-08).
 */
export function RecipeLink({ file, item, children = 'Recipe' }: { file: string; item?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <a
        ref={opener}
        href={githubHref(file)}
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

/**
 * The AI label under an image or on the narration (owner, 2026-10-09): a compact visible label
 * that says AI ("AI image · by @name", "AI voice"), which is itself a button opening the recipe
 * sheet (who made it, the model, a link to the full recipe). The whole declaration
 * ("AI-generated …, not by the author") is in the page as served, visually hidden inside the
 * button, so it is part of its accessible name and crawlers read it (check:principles P2b).
 * Without JavaScript the recipe is a plain link beside it. Built plainly; Design restyles it.
 */
export function AiLabel({
  kind,
  text,
  file,
  item,
  view,
}: {
  kind: 'image' | 'voice';
  /** The visible label; it must include "AI". */
  text: string;
} & ({ file: string; item?: string; view?: undefined } | { view: RecipeView; file?: undefined; item?: undefined })) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const fallback = file ? githubHref(file) : view?.full?.href;
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="ai-label"
        aria-haspopup="dialog"
        data-ai={kind}
        data-recipe={file || undefined}
        data-item={item || undefined}
        onClick={() => setOpen(true)}
      >
        {text}
        <span className="sr-only">
          {' '}
          ({AI_DECLARED[kind]}. {AI_OPENS})
        </span>
      </button>
      {fallback && (
        <noscript>
          {' · '}
          <a href={fallback}>Recipe</a>
        </noscript>
      )}
      {open && (
        <RecipeSheet
          file={file ?? ''}
          item={item}
          view={view}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}

function RecipeSheet({ file, item, view: given, onClose }: { file: string; item?: string; view?: RecipeView; onClose: () => void }) {
  const [fetched, setView] = useState<RecipeView | null>(null);
  const [failed, setFailed] = useState(false);
  const view = given ?? fetched;
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (given) return;
    const q = new URLSearchParams({ file, ...(item ? { item } : {}) });
    fetch(`/api/recipe?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<RecipeView>) : Promise.reject()))
      .then(setView, () => setFailed(true));
  }, [file, item, given]);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('button')?.focus();
    // In the capture phase, so a sheet underneath (the composer) does not also take the key.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== 'Tab' || !sheet.current) return;
      e.stopPropagation();
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button'));
      if (e.shiftKey && document.activeElement === items[0]) (e.preventDefault(), items[items.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === items[items.length - 1]) (e.preventDefault(), items[0].focus());
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const full = view?.full === undefined ? { href: view?.github ?? githubHref(file), text: 'Full recipe on GitHub →' } : view.full;
  const external = !!full && /^https?:/.test(full.href);
  // In a portal, so the sheet is never inside another sheet's scrolling box.
  return createPortal(
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
            {/* Draft wording (coding agent, 2026-10-09): who made it, AI-generated, not by the author. */}
            <dt data-wording="draft">Who made it</dt>
            <dd data-wording="draft" className="recipe-whose">
              {view.whose}
            </dd>
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
            <dd>{view.published ? `By ${view.published.by}${view.published.when ? `, ${view.published.when}` : ''}.` : (view.notPublished ?? 'Not published in the reader by this recipe.')}</dd>
            {view.cost && (
              <>
                <dt>Cost</dt>
                <dd>{view.cost}</dd>
              </>
            )}
            {view.resultLicence && (
              <>
                <dt>Licence of the result</dt>
                <dd>{view.resultLicence}</dd>
              </>
            )}
          </dl>
        )}
        {full && (
          <a
            className="recipe-github"
            href={full.href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={(e) => {
              // On this page (the image's own page): close the sheet, then go to the recipe.
              if (!full.href.startsWith('#')) return;
              e.preventDefault();
              onClose();
              requestAnimationFrame(() => (location.hash = full.href));
            }}
          >
            {full.text}
          </a>
        )}
        <p className="as-draft ic-draftline">Draft wording: “Who made it”</p>
      </div>
    </div>,
    document.body,
  );
}
