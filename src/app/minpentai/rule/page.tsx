import { REPO_URL } from '~/lib/config';
import { RuleView } from './rule-view';

export const metadata = { title: "Minpentai: the book's rule" };

/** The rule recovered from the book's figure (c4-b5, c4-b7), linked from Learn's rules note. */
export default function MinpentaiRulePage() {
  return (
    <div className="page minpentai">
      <RuleView github={`${REPO_URL}/blob/main/docs/minpentai-rules.md`} />
    </div>
  );
}
