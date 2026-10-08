'use client';

import { useState, type ReactNode } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch } from '~/lib/client-auth';
import consent from '../../config/consent.json';

/**
 * Every text box whose contents will be published goes through these
 * (principle 1; npm run check:principles P1f fails on a bare <textarea> or
 * text <input> anywhere else):
 *
 *   PublishedTextField  the box, with the publication line under it
 *   PublishFlow         Preview -> (first time: the consent screen) -> Publish
 */

type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };

const current = consent.versions[consent.current as keyof typeof consent.versions];
/** The line shown under every box and on the consent screen. */
export const PUBLICATION_LINE = current.line;

export function PublishedTextField({
  id,
  label,
  value,
  onChange,
  rows = 3,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <div className="published-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="publication-line">
        {PUBLICATION_LINE}
      </p>
    </div>
  );
}

/** The blocking consent screen: shown before a person's first contribution of their own words. */
function ConsentScreen({ wording, name, onAgree, onCancel, error }: { wording: Wording; name: string | null; onAgree: () => void; onCancel: () => void; error: string | null }) {
  return (
    <div className="consent-overlay">
      <div className="consent-screen" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title">{wording.title}</h2>
        <p className="publication-line">{wording.line}</p>
        {wording.text.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
        <p>{name ? `Your words will be shown as @${name}.` : 'Your words will be shown with your Farcaster name.'}</p>
        {error && <p className="consent-error">{error}</p>}
        <div className="consent-actions">
          <button type="button" onClick={onAgree}>
            I agree
          </button>
          <button type="button" onClick={onCancel}>
            Not now
          </button>
        </div>
        <p className="label">Wording {wording.version}</p>
      </div>
    </div>
  );
}

export function PublishFlow({ preview, onPublish, disabled }: { preview: ReactNode; onPublish: () => Promise<void>; disabled?: boolean }) {
  const [step, setStep] = useState<'edit' | 'consent' | 'preview' | 'publishing'>('edit');
  const [wording, setWording] = useState<Wording | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    const res = await authFetch('/api/consent');
    if (res.status === 401) return setError('Sign in with Farcaster to publish');
    if (!res.ok) return setError('Could not check your agreement');
    const s = (await res.json()) as { wording: Wording; agreed: boolean };
    // Not sdk.context.catch(…): the context is a bridge to the host, and a function can't cross it.
    let ctx: Awaited<typeof sdk.context> | null = null;
    try {
      ctx = await sdk.context;
    } catch {
      ctx = null;
    }
    setName(ctx?.user?.username ?? null);
    setWording(s.wording);
    setStep(s.agreed ? 'preview' : 'consent');
  };

  const agree = async () => {
    const res = await authFetch('/api/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sha256: wording?.sha256 }),
    });
    if (res.ok) setStep('preview');
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not record your agreement');
  };

  const publish = async () => {
    setStep('publishing');
    try {
      await onPublish();
      setStep('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish');
      setStep('preview');
    }
  };

  return (
    <div className="publish-flow">
      {step === 'edit' && (
        <button type="button" onClick={start} disabled={disabled}>
          Preview
        </button>
      )}
      {step === 'consent' && wording && <ConsentScreen wording={wording} name={name} onAgree={agree} onCancel={() => setStep('edit')} error={error} />}
      {(step === 'preview' || step === 'publishing') && (
        <section className="publish-preview" aria-label="Preview">
          <p className="label">Preview: this is how it will appear, to anyone</p>
          {preview}
          <p className="publication-line">
            {PUBLICATION_LINE} {name ? `Shown as @${name}.` : ''}
          </p>
          <button type="button" onClick={publish} disabled={step === 'publishing'}>
            Publish
          </button>
          <button type="button" onClick={() => setStep('edit')}>
            Edit
          </button>
        </section>
      )}
      {error && step !== 'consent' && <p className="consent-error">{error}</p>}
    </div>
  );
}
