import { RemixCardView, type RemixCardData, type RemixCardWords } from './challenge-remix-card';
import { ChallengeEnterIt } from './challenge-enter-it';

/**
 * "Published, not entered yet" on /challenge/entries (2026-11-27), below the entries: challenge pictures published
 * during the challenge that aren't entries (src/lib/challenge/entries.ts, notEnteredShown), newest first as the server
 * gives them (P5g), with no Entry badge and no count. "Enter it" is drawn per viewer in the browser, for the picture's
 * maker only (ChallengeEnterIt). Every word comes in `w`, from the page.
 */
export type NotEnteredWords = { head: string; line: string; draft: string | null; enterIt: string; cards: Record<string, RemixCardWords> };
export type NotEnteredCard = RemixCardData & { enterHref: string };

export function ChallengeNotEntered({ all, w }: { all: NotEnteredCard[]; w: NotEnteredWords }) {
  if (!all.length) return null;
  return (
    <section className="ch-not-entered" aria-labelledby="ch-not-entered-h" data-slot="not-entered">
      <h2 id="ch-not-entered-h" className="ch-not-entered-h">
        {w.head}
        {w.draft && <span className="as-draft ch-draft">{w.draft}</span>}
      </h2>
      <p className="dz-muted ch-not-entered-line">{w.line}</p>
      <ul className="ch-cards ch-entries-list ch-pics ch-not-entered-list" role="list">
        {all.map((r) => (
          <RemixCardView key={r.versionId} r={r} w={w.cards[r.character] ?? { name: r.character, untitled: r.character, alt: '' }}>
            <ChallengeEnterIt maker={r.byFid} href={r.enterHref} label={w.enterIt} />
          </RemixCardView>
        ))}
      </ul>
    </section>
  );
}
