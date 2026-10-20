import Link from 'next/link';
import { MinpentaiTags } from '../mp-tags';
import { RULES_HTML } from './rules-html';

export const metadata = { title: 'Minpentai in this edition: the rules' };

/** Where the lessons (Learn) differ from Play: exactly these five (owner, 2026-10-20). Model-drafted wording. */
const LESSONS_VS_PLAY: [what: string, text: string][] = [
  ['The broadcast', 'It shows four players on a 48×32 board. Play is two players on 15 × 10.'],
  ['Amber’s towers in setup', 'The practice match in the lessons shows Amber’s towers during setup. In Play you see only outlines of where they start.'],
  ['Hits in the dark', 'The practice match in the lessons marks every hit, even in the dark. In Play you see only the hits your towers light.'],
  ['Cells', 'The lessons have a CELLS button that draws each piece as a few cells. Play has no cell view: you play with whole squares.'],
  ['Pause', 'The practice match in the lessons can be paused. Play’s practice match has no pause; it can fast-forward to your next turn.'],
];

/**
 * Claude Design's rules page (docs/design/minpentai-rules.dc.html, draft 1, word for word), the
 * rules Play's game follows (src/lib/minpentai/play-game/). Every rule marked INVENTED is ours;
 * BOOK marks a rule the cited block says. The book's own cell rule is /minpentai/rule.
 */
export default function MinpentaiRulesPage() {
  return (
    <div className="page minpentai mp-rules-page">
      <p className="mp-rules-back"><Link href="/minpentai?mode=play">← Minpentai</Link></p>
      {/* Owner, 2026-10-09: one draft line, since the page says it overrides the lessons. Model-drafted wording. */}
      <div className="mp-rules-note"><MinpentaiTags tags={['draft']} /><p>For now the lessons still teach the first version of these rules (v3); Play follows this page.</p></div>
      {/* Owner, 2026-10-20: a short list of where the lessons still differ from Play, linked from Learn's rules note
          (LESSONS VS PLAY →). Until the lessons move to the engine Play uses. Model-drafted wording. */}
      <section id="lessons-vs-play" className="mp-rules-diff" aria-labelledby="lessons-vs-play-h">
        <h2 id="lessons-vs-play-h">Lessons vs Play</h2>
        <MinpentaiTags tags={['draft']} />
        <p>Five things the lessons show differently from Play, for now:</p>
        <ul>
          {LESSONS_VS_PLAY.map(([what, text]) => <li key={what}><strong>{what}.</strong> {text}</li>)}
        </ul>
      </section>
      <article className="mp-rules" dangerouslySetInnerHTML={{ __html: RULES_HTML }} />
    </div>
  );
}
