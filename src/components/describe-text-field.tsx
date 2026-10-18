import { CHAT } from '~/lib/config';

/**
 * The live shot editor's "Describe the shot" box (branch describe-shot, 2026-10-18): what the person
 * types is sent, with the shot's camera and people, to the model's host to work out the camera move,
 * and is not kept or published. It says so under the box (check:principles P1f checks this wording).
 * The box never sends anything itself; the editor does. Wording DRAFTED by the coding agent.
 */
export function DescribeTextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={2} value={value} maxLength={maxLength} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="ed-help">
        Sent with this shot&rsquo;s camera and people to {CHAT.providerName}
        {CHAT.gatewayFallback ? ` (through ${CHAT.host} when ${CHAT.providerName} is busy)` : ''} to work out the move. Not kept. Never published.
      </p>
    </>
  );
}
