'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { StyleExample } from '~/lib/challenge/styles';
import { AiTag } from './ai-tag';

/**
 * "See examples" (owner, 2026-11-12: "Luis asked what 'Mood' means as a style, so the style row needs to explain
 * itself"): a link that opens a panel listing each published style with its name (its display label), its words and two
 * or three of its newest version's published samples. Tapping a style (its row or a sample) picks it and closes the
 * panel. "Same as this picture", Random and Write your own are never here: the caller passes published styles only
 * (src/lib/challenge/make.ts, styleExamples), in the Style row's order.
 *
 * Self-contained so any layout can mount it (redesign D included): it takes the styles, the words, the chosen id and
 * `onPick`; it knows nothing of the remix screen. A native modal <dialog> (role dialog, modal, focus kept inside; Escape
 * closes), with a visible Close button; focus returns to the link on close. On phones (under 768px, the site's
 * breakpoint) it is a bottom sheet, full width; wider, a panel on the right. Samples load lazily, only once it is open,
 * and each carries the AI label (AiTag), its alt saying it is an AI-generated sample of that style. A sample is a tap
 * target (out of the tab order: the style's row is the keyboard's one stop per style).
 */
export interface StyleExamplesWords {
  seeExamples: string;
  examplesTitle: string;
  examplesClose: string;
  examplesLead?: string;
}

export function StyleExamples({ styles, w, selected = null, onPick }: { styles: readonly StyleExample[]; w: StyleExamplesWords; selected?: string | null; onPick: (styleId: string) => void }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('.se-close')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  if (!styles.length) return null;
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  const pick = (id: string) => {
    onPick(id);
    close();
  };

  return (
    <>
      <button ref={opener} type="button" className="se-link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {w.seeExamples}
      </button>
      <dialog
        ref={dialog}
        className="se-panel"
        aria-modal="true"
        aria-labelledby={titleId}
        // Escape (the dialog's cancel) and a tap on the backdrop close it.
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {open && (
          <div className="se-inner">
            <div className="se-head">
              <h2 id={titleId} className="se-title">
                {w.examplesTitle}
              </h2>
              <button type="button" className="se-close" onClick={close}>
                {w.examplesClose}
              </button>
            </div>
            {w.examplesLead && <p className="dz-muted se-lead">{w.examplesLead}</p>}
            <ul className="se-list" role="list">
              {styles.map((s) => (
                <li key={s.id} className="se-style" data-style={s.id}>
                  <button type="button" className="se-pick" aria-pressed={selected === s.id} onClick={() => pick(s.id)}>
                    <span className="se-name">{s.label}</span>
                    <span className="se-words">{s.words}</span>
                  </button>
                  {s.samples.length > 0 && (
                    <ul className="se-samples" role="list">
                      {s.samples.map((p, i) => (
                        <li key={`${p.url}-${i}`}>
                          <figure className="se-sample">
                            <button type="button" className="se-sample-pick" tabIndex={-1} onClick={() => pick(s.id)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt={p.alt} loading="lazy" decoding="async" />
                            </button>
                            <figcaption className="se-sample-cap">
                              <AiTag />
                            </figcaption>
                          </figure>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </dialog>
    </>
  );
}
