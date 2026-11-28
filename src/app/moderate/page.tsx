import { ModerateQueue } from '~/components/moderate-queue';
import { ModerateStoryboards } from '~/components/moderate-storyboards';
import { StorageCheck } from '~/components/storage-check';
import { IMAGE_WORDING as W } from '~/lib/images/wording';

export const metadata = { title: 'Reports', robots: { index: false } };

/**
 * The moderator queue (section 6): reported readers' images, where moderators can only hide or dismiss; and, since
 * 2026-11-23, reported published storyboards (hide, dismiss, and unhide a hidden one), so one queue holds every report.
 */
export default function Moderate() {
  return (
    <div className="page prose moderate">
      <h1>Reports</h1>
      <p>Reported images and storyboards, with each reason, its count and the reporters&apos; notes. Who reported is never shown. Moderators can hide one or dismiss its reports, and unhide a hidden storyboard, which puts back exactly what its maker published; nothing else.</p>
      <ModerateQueue />
      <ModerateStoryboards />
      <StorageCheck />
      <p className="as-draft ic-draftline">{W.draftLine}</p>
    </div>
  );
}
