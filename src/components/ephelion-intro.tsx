import { BookCite } from '~/components/book-cite';

/** A citation: the book icon linked to its block in the reader, as the Learn more texts' (Nate, 2026-11-24: no visible block code). */
const Cite = ({ b }: { b: string }) => <BookCite block={b} />;

/**
 * The Ephelion challenge's intro on /storyboard/record (Nate, 2026-11-22; reread word for word), drawn by VoiceRecord.
 * Its own file so the tests can draw it (scripts/lib/render-learn-more.tsx). Its citations are book icons (Nate,
 * 2026-11-24: no visible block codes; src/components/book-cite.tsx).
 */
export function EphelionIntro() {
  return (
    <div className="vr-intro">
      <p>
        Lord Ephelion is the Arctic Empire&apos;s consul to Veridia (<Cite b="c3-b5" />). In the book his messages reach Veridians everywhere: on a poster in a tunnel (<Cite b="c3-b4" />), in a live debate (<Cite b="c8-b17" />), on a restaurant screen that cuts into a Helisport game (<Cite b="c13-b62" />). As one character puts it, &quot;Ephelion&apos;s goal is to inspire people inside Veridia to join the Arctic cause.&quot; (<Cite b="c21-b76" />)
      </p>
      <p>Give one of his speeches a voice: perform it yourself, or start from a ready-made reading, then storyboard it.</p>
    </div>
  );
}
