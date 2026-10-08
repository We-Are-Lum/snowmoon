import { ModerateQueue } from '~/components/moderate-queue';

export const metadata = { title: 'Reports', robots: { index: false } };

/** The moderator queue (section 6): reported readers' images; moderators can only hide or dismiss. */
export default function Moderate() {
  return (
    <div className="page prose moderate">
      <h1>Reports</h1>
      <p>Reported images, with each reason, its count and the reporters&apos; notes. Who reported is never shown. Moderators can hide an image or dismiss its reports; nothing else.</p>
      <ModerateQueue />
    </div>
  );
}
