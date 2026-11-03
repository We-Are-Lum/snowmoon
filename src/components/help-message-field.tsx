import { CHAT } from '~/lib/config';

/**
 * The "Ask for help" message box beside a sheet's text (src/components/sheet-help.tsx): its contents are never
 * published. Kept only in the open page (gone when you leave it), and sent with the sheet's text to the model's hosts
 * to suggest a change (or, in "Find a moment", with passages from the book to find moments). It says so under the box, as PrivateTextField does for the assistant (check:principles P1f
 * checks this wording). Model-drafted wording (2026-11-02), labelled draft, for the owner.
 */
export function HelpMessageField({ id, label, value, onChange, maxLength, placeholder, mode = 'change' }: { id: string; label: string; value: string; onChange: (v: string) => void; maxLength: number; placeholder?: string; mode?: 'change' | 'moment' }) {
  return (
    <div className="private-field">
      <label className="as-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={2} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="private-line">
        {mode === 'moment' ? (
          <>
            Kept only on this page. Sent with passages from the book to {CHAT.providerName}
            {CHAT.gatewayFallback ? ` (through ${CHAT.host} when ${CHAT.providerName} is busy)` : ''} to find moments. Never published.{' '}
          </>
        ) : (
          <>
            Kept only on this page. Sent with this sheet’s text to {CHAT.providerName}
            {CHAT.gatewayFallback ? ` (through ${CHAT.host} when ${CHAT.providerName} is busy)` : ''} to suggest a change. Never published.{' '}
          </>
        )}
        <span className="as-draft">Draft wording</span>
      </p>
    </div>
  );
}
