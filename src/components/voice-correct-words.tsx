'use client';

import { useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { PublishedTextField } from '~/components/publish-words';
import { IMPROV_WORDING as W } from '~/lib/voice/improv-wording';

/**
 * Correct the transcript of one's own improvised words (Nate, 2026-11-24), before storyboarding: one box per sentence,
 * the person's own edits only (no model), kept with the draft's history (POST /api/voice/drafts/<id>/words).
 */
export function CorrectWords({ draftId, sentences, busy, onSaved }: { draftId: string; sentences: { n: number; text: string }[]; busy: boolean; onSaved: (message: string) => void }) {
  const [texts, setTexts] = useState(sentences.map((s) => s.text));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = texts.some((t, i) => t.trim() !== sentences[i].text);
  return (
    <details className="vr-correct" data-slot="correct-words">
      <summary>
        {W.correct.summary}
      </summary>
      <p className="vr-small">{W.correct.intro}</p>
      <ol className="vr-correct-list">
        {sentences.map((s, i) => (
          <li key={s.n}>
            <PublishedTextField id={`vr-cw-${draftId}-${s.n}`} label={W.correct.label(i + 1)} value={texts[i]} onChange={(v) => setTexts((t) => t.map((x, j) => (j === i ? v : x)))} rows={2} maxLength={400} />
          </li>
        ))}
      </ol>
      {error && <p className="vr-warn" role="alert">{error}</p>}
      <button
        type="button"
        className="vr-btn vr-small-btn"
        disabled={busy || saving || !changed || texts.some((t) => !t.trim())}
        onClick={async () => {
          setSaving(true);
          setError(null);
          const r = await authFetch(`/api/voice/drafts/${draftId}/words`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sentences: texts }) }).catch(() => null);
          const j = ((await r?.json().catch(() => ({}))) ?? {}) as { id?: string; error?: string };
          setSaving(false);
          if (r?.ok && j.id) onSaved(W.correct.saved);
          else setError(j.error ?? 'The corrected words could not be kept. Try again.');
        }}
      >
        {saving ? W.correct.saving : W.correct.save}
      </button>
    </details>
  );
}
