import 'server-only';
import { glossaryTerm } from '../glossary';
import { firstLayerFacts } from './cards';
import { callNameOf } from './names';
import { LANDING_WORDING as L } from './landing-wording';
import { LATER_LABEL, LEARN_MORE, OPEN_MAX_CHAPTER, citeHref, learnMoreProblems, type Segment } from './learn-more';

/**
 * "Learn more about {Name}" as the page draws it (owner, 2026-11-12): one expander, replacing "Read where {Name} first
 * appears" and #160's "Read more". A character's texts (src/lib/challenge/learn-more.ts) are shown only when they keep
 * the rule (learnMoreProblems: "who", "start" and "drives" cite chapters 1 to 14); "later" goes only into its fold,
 * labelled exactly LATER_LABEL. A character whose texts don't keep it yet shows the first layer's facts instead
 * (firstLayerFacts, chapters 1 to 14), in the same expander. Each glossary term opens its entry: a sentence the book
 * says, from chapters 1 to 14 in the open parts (any chapter inside the fold), and the glossary page.
 */
export type Rendered =
  | { kind: 'text'; text: string }
  | { kind: 'term'; term: string; id: string; note: { text: string; cite: string; href: string } | null; href: string | null }
  | { kind: 'cite'; label: string; href: string };

export interface LearnMoreView {
  title: string;
  /** "Draft wording" while the texts aren't the owner's or approved by him; null otherwise. */
  draft: string | null;
  text: {
    who: { head: string; segs: Rendered[] };
    start: { head: string; segs: Rendered[] };
    later: { head: string; segs: Rendered[] };
    drives: { head: string; segs: Rendered[] };
    invent: { head: string; items: Rendered[][] };
  } | null;
  /** The fallback: the first layer's facts (chapters 1 to 14), when the texts aren't shown. */
  facts: { text: string; block: string; quote: string; chapter: number }[];
  factsNote: string;
  chips: string[];
  looks: string;
  glossaryLink: string;
}

/** A glossary entry's note: a sentence the book says about it, no later than `max` (its explanation, else its first sentence). */
function note(slug: string, max: number): { text: string; cite: string; href: string } | null {
  const t = glossaryTerm(slug);
  if (!t) return null;
  const e = t.explanations.find((x) => x.chapter <= max) ?? (t.firstSentence.chapter <= max ? t.firstSentence : null);
  return e ? { text: e.text, cite: e.block, href: `/glossary/${slug}` } : null;
}

function render(slug: string, part: string, segs: readonly Segment[], max: number): Rendered[] {
  return segs.map((s, i): Rendered => {
    if ('cite' in s) return { kind: 'cite', label: s.cite, href: citeHref(s.cite) };
    if ('term' in s) return { kind: 'term', term: s.term, id: `lm-${slug}-${part}-${i}`, note: s.glossaryId ? note(s.glossaryId, max) : null, href: s.glossaryId ? `/glossary/${s.glossaryId}` : null };
    return { kind: 'text', text: s.text };
  });
}

export function learnMoreView(slug: string, name: string): LearnMoreView {
  const P = L.character;
  const t = LEARN_MORE[slug];
  const shown = t && learnMoreProblems(slug).length === 0 ? t : null;
  // The book's call name: "Zei", and "Lord Ephelion" with his title (src/lib/challenge/names.ts).
  const call = callNameOf(name);
  return {
    title: P.learnMore(call),
    draft: shown && !shown.approved ? P.draft : null,
    text: shown
      ? {
          who: { head: P.whoHead(shown.pronoun), segs: render(slug, 'who', shown.who, OPEN_MAX_CHAPTER) },
          start: { head: P.startText, segs: render(slug, 'start', shown.start, OPEN_MAX_CHAPTER) },
          later: { head: LATER_LABEL, segs: render(slug, 'later', shown.later, Infinity) },
          drives: { head: P.drivesHead(shown.pronoun), segs: render(slug, 'drives', shown.drives, OPEN_MAX_CHAPTER) },
          invent: { head: P.inventHead, items: shown.invent.map((x, i) => render(slug, `invent${i}`, x, OPEN_MAX_CHAPTER)) },
        }
      : null,
    facts: shown ? [] : firstLayerFacts(slug),
    factsNote: P.factsNote,
    chips: shown ? [] : firstLayerFacts(slug).map((f) => P.factChip(f.chapter)),
    looks: P.looks(call),
    glossaryLink: P.glossaryLink,
  };
}
