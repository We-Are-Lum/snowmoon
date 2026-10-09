import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Fragment, type CSSProperties } from 'react';
import { blockId, chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { blockFacts, labelRange, type BlockFacts } from '~/lib/reading';
import { figureMinWidth, renderMarkdown, renderScreen, screenBasePx, type ScreenSource } from '~/lib/render';
import { DEFAULT_TEMPLATES } from '~/templates';
import { REPO_URL, WORK } from '~/lib/config';
import { loadNarration } from '~/lib/narration';
import { loadIllustrations } from '~/lib/illustrations';
import { QuoteShare } from '~/components/quote-share';
import { ChapterView } from '~/components/chapter-view';
import { AiLabel, RecipeLink } from '~/components/recipe-sheet';
import { AI_LABEL } from '~/lib/ai-declared';
import { AddImageButton } from '~/components/reader-images';
import { ReadingRecord } from '~/components/reading-record';
import { LiveScreen } from '~/components/live-screen';
import { adaptationsCiting as citing } from '~/lib/adaptations';
import { ADAPTATIONS } from '~/lib/config';

// No "cited in" marks while adaptations are out of view (ADAPTATIONS.visible).
const adaptationsCiting: typeof citing = (...a) => (ADAPTATIONS.visible ? citing(...a) : []);
import type { Block } from '~/lib/book';

type Props = { params: Promise<{ n: string }> };

/** Block indexes in display order: an opening heading + dateline pair shows the dateline first. */
function displayOrder(blocks: Block[]): number[] {
  const order = blocks.map((_, i) => i);
  if (blocks[0]?.kind === 'heading' && blocks[1]?.kind === 'dateline') [order[0], order[1]] = [1, 0];
  return order;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return chapterNumbers().map((n) => ({ n: String(n) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Chapter ${(await params).n}` };
}

/** "Scene 2 · ¶ 9–31", shown at the end of each scene. */
function sceneLabels(blocks: Block[], facts: BlockFacts[]): Map<number, { label: string; start: number; end: number }> {
  const out = new Map<number, { label: string; start: number; end: number }>();
  let first: number | null = null;
  let last: number | null = null;
  let lastIdx = -1;
  // The scene's first eight labelled blocks: what "+ Add an image" opens on (decision 5: up to 8).
  let span: number[] = [];
  const close = (scene: number) => {
    if (first !== null && last !== null) out.set(lastIdx, { label: `Scene ${scene} · ${labelRange(first, last)}`, start: span[0], end: span[Math.min(span.length, 8) - 1] });
    first = last = null;
    span = [];
  };
  blocks.forEach((b, i) => {
    const f = facts[i];
    if (b.kind === 'break') close(f.scene - 1);
    if (f.label !== null) {
      first ??= f.label;
      last = f.label;
      lastIdx = b.idx;
      span.push(b.idx);
    }
  });
  close(facts[facts.length - 1]?.scene ?? 1);
  return out;
}

export default async function ChapterPage({ params }: Props) {
  const n = Number((await params).n);
  const chapter = loadChapter(n);
  if (!chapter) notFound();
  const facts = blockFacts(chapter.blocks);
  const scenes = sceneLabels(chapter.blocks, facts);
  const narration = loadNarration(n);
  const images = loadIllustrations(n);
  const imageAt = new Map(images.map((im) => [im.idx, im]));
  // Blocks the narration speaks as a description rather than the book's words.
  const described = new Set((narration?.cues ?? []).filter((c) => c.description).map((c) => c.idx));
  const DESCRIBED = 'narrated as a model-drafted description, not the author’s words';
  // Figures the Minpentai sandbox can play. Its free mode opens on the c4-b5 board.
  const PLAYABLE: Record<string, string> = { 'c4-b5': '/minpentai?mode=free' };
  // Voting screens the reader can try (src/templates/live.ts). One "Draft wording" line per
  // page: on the first of them.
  const liveSlider = (b: Block, source: ScreenSource) =>
    source.from === 'template' ? (DEFAULT_TEMPLATES.find((t) => t.id === source.templateId)?.live?.(b) ?? null) : null;
  const firstLive = chapter.blocks.find((b) => (b.kind === 'screen' || b.kind === 'figure') && liveSlider(b, renderScreen(b, DEFAULT_TEMPLATES).source))?.idx;

  return (
    <ChapterView
      chapter={n}
      dateline={chapterDateline(chapter)}
      chapters={chapterNumbers().map((k) => ({ n: k, dateline: chapterDateline(loadChapter(k)!) }))}
      narration={
        narration
          ? { label: narration.label, recipe: narration.recipe, url: narration.url, duration: narration.duration, cues: narration.cues }
          : null
      }
      images={images.map(({ id, idx, url, alt, recipe }) => ({ id, idx, url, alt, recipe }))}
      labels={Object.fromEntries(chapter.blocks.map((b, i) => [b.idx, facts[i].label]).filter(([, l]) => l !== null))}
    >
    <article className="page chapter" data-chapter={n} data-setting={facts.find((f) => f.setting)?.setting ?? undefined}>
      {/* The prototype sets the dateline above the chapter heading; the book's order (heading, then
          dateline) is unchanged in the text and the narration. Only that opening pair is swapped. */}
      {displayOrder(chapter.blocks).map((i) => {
        const b = chapter.blocks[i];
        const id = blockId(n, b.idx);
        const f = facts[i];
        const common = {
          id,
          'data-setting': f.setting ?? undefined,
          'data-label': f.label ?? undefined,
        };
        let el;
        if (b.kind === 'break') {
          el = <hr {...common} className="block break" />;
        } else if (b.kind === 'screen' || b.kind === 'figure') {
          const { html, source } = renderScreen(b, DEFAULT_TEMPLATES);
          const live = liveSlider(b, source);
          const minWidth = b.kind === 'figure' ? figureMinWidth(b) : null;
          const style = { '--screen-base': `${screenBasePx(b)}px`, ...(minWidth ? { '--fig-min': `${minWidth}px` } : {}) } as CSSProperties;
          el = (
            <figure {...common} className={`block ${b.kind}`} style={style}>
              {live ? (
                <LiveScreen html={html} slider={live} draftLine={b.idx === firstLive} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
              <figcaption className="block-caption">
                ¶ {f.label} · {source.from === 'template' ? `template ${source.templateId}` : 'as drawn in the book'}
                {described.has(b.idx) && ` · ${DESCRIBED}`}
              </figcaption>
              {PLAYABLE[id] && (
                <Link className="play-figure" href={PLAYABLE[id]}>
                  Play this figure
                </Link>
              )}
            </figure>
          );
        } else {
          const Tag = b.kind === 'paragraph' ? 'p' : 'div';
          // A paragraph an adaptation cites ends with a small mark linking to it.
          const marks =
            b.kind === 'paragraph'
              ? adaptationsCiting(n, b.idx)
                  .map((s) => ` <a class="cite-mark" href="/adaptations/${s.slug}" title="Cited in ${s.title}" aria-label="Cited in ${s.title}">◆</a>`)
                  .join('')
              : '';
          el = <Tag {...common} className={`block ${b.kind}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(b) + marks }} />;
          if (described.has(b.idx)) {
            el = (
              <>
                {el}
                <p className="block-caption described-note">¶ {f.label} · {DESCRIBED}</p>
              </>
            );
          }
        }
        const scene = scenes.get(b.idx);
        const image = imageAt.get(b.idx);
        // Blocks that can't carry an inline mark (quotes, screens, figures) get a line instead.
        const citedBy = b.kind === 'paragraph' ? [] : adaptationsCiting(n, b.idx);
        return (
          <Fragment key={id}>
            {el}
            {citedBy.length > 0 && (
              <p className="cited-by">
                ↳ cited in{' '}
                {citedBy.map((seed, i) => (
                  <Fragment key={seed.slug}>
                    {i > 0 && ', '}
                    <Link href={`/adaptations/${seed.slug}`}>{seed.title}</Link>
                  </Fragment>
                ))}
              </p>
            )}
            {image && (
              <figure className="seed-image" data-for={id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} width={image.width} height={image.height} loading="lazy" />
                <figcaption className="block-caption">
                  ¶ {f.label} · <AiLabel kind="image" text={AI_LABEL.image} file={image.recipe} item={image.id} />
                  {image.lettering && (
                    <>
                      {' · '}
                      <RecipeLink file={image.lettering} item={image.id}>
                        Lettering
                      </RecipeLink>
                    </>
                  )}
                </figcaption>
              </figure>
            )}
            {scene && (
              <p className="scene-label">
                {scene.label}
                <AddImageButton chapter={n} start={scene.start} end={scene.end} />
              </p>
            )}
          </Fragment>
        );
      })}
      <ReadingRecord chapter={n} />
      {/* Board 1b (there is no chapter menu yet): a private thread about this chapter. */}
      <Link className="ask-chapter" href={`/assistant?chapter=${n}`}>
        Ask about this chapter
      </Link>
      <nav className="chapter-nav" aria-label="Chapters">
        {n > 1 ? <Link href={`/chapter/${n - 1}`}>← Chapter {n - 1}</Link> : <span />}
        <Link href="/">Contents</Link>
        {n < WORK.chapters ? <Link href={`/chapter/${n + 1}`}>Chapter {n + 1} →</Link> : <span />}
      </nav>
      <a className="provenance" href={chapter.source_url}>
        Text from the source edition, fetched {chapter.fetched_at} · GPL v3
      </a>
      {/* The narration's credit and recipe, in the page as served (principle 1; check:principles P1d). One short line. */}
      {narration && (
        <p className="provenance narration-credit">
          <AiLabel kind="voice" text={AI_LABEL.voice} file={narration.recipe} />
        </p>
      )}
      <QuoteShare chapter={n} images={images.map(({ id, idx, url, alt }) => ({ id, idx, url, alt }))} />
    </article>
    </ChapterView>
  );
}
