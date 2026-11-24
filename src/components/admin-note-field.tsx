/**
 * A text box whose contents are never published: an admin's private note on a bounty claim or a challenge entry
 * (/admin/bounty; owner, 2026-11-23). Read only by admins, with the admin's name, and it says so under the box, the way
 * PublishedTextField shows the publication line. check:principles P1f allows it and checks this wording; it sends
 * nothing itself (its page saves the note).
 */
export function AdminNoteField({ id, label, value, onChange, maxLength, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; maxLength: number; placeholder?: string }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={3} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-line`} />
      <p id={`${id}-line`} className="ab-note">
        Private: only admins read it, with who wrote it. Never published.
      </p>
    </>
  );
}
