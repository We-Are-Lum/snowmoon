import { permanentRedirect } from 'next/navigation';

/**
 * /storyboard/record moved to /ephelion (Nate, 2026-11-24: "a better address than /storyboard/record, with the old one
 * redirecting"). A permanent redirect (308), so old links and casts still open the page.
 */
export const dynamic = 'force-dynamic';

export default function OldRecordPage() {
  permanentRedirect('/ephelion');
}
