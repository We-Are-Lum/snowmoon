import Link from 'next/link';
import { RULES_HTML } from './rules-html';

export const metadata = { title: 'Minpentai in this edition: the rules' };

/**
 * Claude Design's rules page (docs/design/minpentai-rules.dc.html, draft 1, word for word), the
 * rules Play's game follows (src/lib/minpentai/play-game/). Every rule marked INVENTED is ours;
 * BOOK marks a rule the cited block says. The book's own cell rule is /minpentai/rule.
 */
export default function MinpentaiRulesPage() {
  return (
    <div className="page minpentai mp-rules-page">
      <p className="mp-rules-back"><Link href="/minpentai?mode=play">← Minpentai</Link></p>
      <article className="mp-rules" dangerouslySetInnerHTML={{ __html: RULES_HTML }} />
    </div>
  );
}
