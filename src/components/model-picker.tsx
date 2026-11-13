import React from 'react'; // classic JSX in scripts that render this (scripts/lib/model-choice-render.tsx)
import { ADULT_CONFIRM, MODEL_NOTICES, NOTICE_BUTTONS } from '~/lib/legal';
import { IMAGE_WORDING } from '~/lib/images/wording';

/**
 * The remix form's model picker and the closed models' notice (branch remix-model-choice; IMAGES.designs.modelChoice).
 * Presentational only: no state, no storage, no request. The form decides when the notice shows
 * (src/lib/images/model-notice.ts) and what an answer does. The open models are listed first and are the default; a
 * closed model shows its maker's retention label beside it always, whether or not its notice was answered.
 */
export type ModelOption = { id: string; name: string; terms: string; open: boolean; maker: string | null; perRemixUsd: number; retention: string | null };
const W = IMAGE_WORDING.designs.models;

export function ModelPicker(p: { choices: ModelOption[]; modelId: string; onPick: (m: ModelOption) => void }) {
  return (
    <ul className="dz-rows dz-model-rows">
      {p.choices.map((m) => (
        <li key={m.id}>
          <label className={`dz-row dz-style-option${p.modelId === m.id ? ' is-on' : ''}`}>
            <input type="radio" name="dz-model" value={m.id} checked={p.modelId === m.id} onChange={() => p.onPick(m)} />
            <span className="dz-row-text">
              <span className="dz-row-title">{m.open ? W.openDefault : m.name}</span>
              <span className="dz-row-meta">
                {m.open ? `${m.name} · ` : ''}
                {m.terms} · about ${m.perRemixUsd.toFixed(2)} for three views
              </span>
              {m.retention && <span className="dz-row-meta dz-retention">{m.retention}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * The maker's notice, with the 18+ box when the device hasn't answered it yet. Both buttons wait for the box.
 * `inDialog` (the remix challenge's redesign D): the caller wraps it in its own modal dialog, so this is its content
 * (no role of its own) and the title is the dialog's heading; `cancel` adds a third button that never waits for the box
 * (the challenge's "Use the open model"). The words are the legal texts either way.
 */
export function ModelNotice(p: { maker: string; askAdult: boolean; adultTicked: boolean; onTick: (v: boolean) => void; onAnswer: (b: 'ok' | 'never') => void; inDialog?: boolean; cancel?: { label: string; onCancel: () => void } }) {
  const n = MODEL_NOTICES[p.maker as keyof typeof MODEL_NOTICES];
  if (!n) return null;
  const blocked = p.askAdult && !p.adultTicked;
  return (
    <div className="dz-notice" role={p.inDialog ? undefined : 'dialog'} aria-labelledby={p.inDialog ? undefined : 'dz-notice-title'}>
      {p.inDialog ? (
        <h2 className="dz-notice-title" id="dz-notice-title">
          {n.title}
        </h2>
      ) : (
        <p className="dz-label" id="dz-notice-title">
          {n.title}
        </p>
      )}
      {n.text.map((t) => (
        <p key={t} className="dz-note">
          {t}
        </p>
      ))}
      {p.askAdult && (
        <>
          <p className="dz-note">{ADULT_CONFIRM.line}</p>
          <label className="dz-row">
            <input type="checkbox" checked={p.adultTicked} onChange={(e) => p.onTick(e.target.checked)} /> {ADULT_CONFIRM.box}
          </label>
        </>
      )}
      <p className="dz-notice-buttons">
        <button type="button" className="ic-primary" disabled={blocked} onClick={() => p.onAnswer('ok')}>
          {NOTICE_BUTTONS.ok}
        </button>{' '}
        <button type="button" className="ic-link" disabled={blocked} onClick={() => p.onAnswer('never')}>
          {NOTICE_BUTTONS.never}
        </button>
        {p.cancel && (
          <>
            {' '}
            <button type="button" className="ic-secondary dz-notice-cancel" onClick={p.cancel.onCancel}>
              {p.cancel.label}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
