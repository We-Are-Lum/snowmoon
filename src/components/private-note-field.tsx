/**
 * A text box whose contents are never published: a report's note, read only by moderators
 * (docs/proposals/add-an-image.md, section 6). It says so under the box, the way
 * PublishedTextField shows the publication line. check:principles P1f allows text boxes only
 * here, in PublishedTextField and in PrivateTextField, and checks this wording.
 */
export function PrivateNoteField({
  id,
  label,
  value,
  onChange,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
}) {
  return (
    <div className="private-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={2} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="private-line">
        Private: only moderators read it, without your name. Never published.
      </p>
    </div>
  );
}
