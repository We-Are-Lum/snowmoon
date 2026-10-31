import Link from 'next/link';
import { REPO_URL } from '~/lib/config';
import { FOOTER_LINE } from '~/lib/legal';
import { SUPPORT } from '~/lib/config';
import { SUPPORT_WORDING } from '~/lib/support-wording';

/**
 * The footer line (the owner's legal starter): at the foot of About, in the menu sheet and at the
 * bottom of the desktop rail, not on every phone screen. Quiet label type; the links sit in the line.
 */
export function LegalLine({ className }: { className?: string }) {
  return (
    <p className={`legal-line${className ? ` ${className}` : ''}`}>
      {FOOTER_LINE.map((part) => (
        <span key={part}>{part} · </span>
      ))}
      <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <a href={REPO_URL}>Source</a>
      {/* "Support this site" (owner, 2026-10-30): from About and the footer, not the main menu; shown once SUPPORT.linked. */}
      {SUPPORT.linked && (
        <>
          {' · '}
          <Link href="/support">{SUPPORT_WORDING.link}</Link>
        </>
      )}
    </p>
  );
}
