import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Fragment, type CSSProperties } from 'react';
import { blockId, chapterNumbers, loadChapter } from '~/lib/book';
import { blockFacts, labelRange, type BlockFacts } from '~/lib/reading';
import { figureMinWidth, renderMarkdown, renderScreen, screenBasePx } from '~/lib/render';
import { DEFAULT_TEMPLATES } from '~/templates';
import { REPO_URL, WORK } from '~/lib/config';
import { loadNarration } from '~/lib/narration';
import { loadIllustrations } from '~/lib/illustrations';
import { ChapterPlayer } from '~/components/chapter-player';
import { QuoteShare } from '~/components/quote-share';
import type { Block } from '~/lib/book';

type Props = { params: Promise<{ n: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return chapterNumbers().map((n) => ({ n: String(n) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Chapter ${(await params).n}` };
}

/** "Scene 2 · ¶ 9–31", shown at the end of each scene. */
function sceneLabels(blocks: Block[], facts: BlockFacts[]): Map<number, string> {
  const out = new Map<number, string>();
  let first: number | null = null;
  let last: number | null = null;
  let lastIdx = -1;
  const close = (scene: number) => {
    if (first !== null && last !== null) out.set(lastIdx, `Scene ${scene} · ${labelRange(first, last)}`);
    first = last = null;
  };
  blocks.forEach((b, i) => {
    const f = facts[i];
    if (b.kind === 'break') close(f.scene - 1);
    if (f.label !== null) {
      first ??= f.label;
      last = f.label;
      lastIdx = b.idx;
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

  return (
    <article className="page chapter" data-chapter={n} data-setting={facts.find((f) => f.setting)?.setting ?? undefined}>
      {chapter.blocks.map((b, i) => {
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
          const minWidth = b.kind === 'figure' ? figureMinWidth(b) : null;
          const style = { '--screen-base': `${screenBasePx(b)}px`, ...(minWidth ? { '--fig-min': `${minWidth}px` } : {}) } as CSSProperties;
          el = (
            <figure {...common} className={`block ${b.kind}`} style={style}>
              <div dangerouslySetInnerHTML={{ __html: html }} />
              <figcaption className="block-caption">
                ¶ {f.label} · {source.from === 'template' ? `template ${source.templateId}` : 'as drawn in the book'}
              </figcaption>
            </figure>
          );
        } else {
          const Tag = b.kind === 'paragraph' ? 'p' : 'div';
          el = <Tag {...common} className={`block ${b.kind}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(b) }} />;
        }
        const scene = scenes.get(b.idx);
        const image = imageAt.get(b.idx);
        return (
          <Fragment key={id}>
            {el}
            {image && (
              <figure className="seed-image" data-for={id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} width={image.width} height={image.height} loading="lazy" />
                <figcaption className="block-caption">
                  ¶ {f.label} · seeded image, a starting point ·{' '}
                  <a href={`${REPO_URL}/blob/main/${image.recipe}`}>recipe</a>
                </figcaption>
              </figure>
            )}
            {scene && <p className="scene-label">{scene}</p>}
          </Fragment>
        );
      })}
      <nav className="chapter-nav" aria-label="Chapters">
        {n > 1 ? <Link href={`/chapter/${n - 1}`}>← Chapter {n - 1}</Link> : <span />}
        <Link href="/">Contents</Link>
        {n < WORK.chapters ? <Link href={`/chapter/${n + 1}`}>Chapter {n + 1} →</Link> : <span />}
      </nav>
      <a className="provenance" href={chapter.source_url}>
        Text from the source edition, fetched {chapter.fetched_at} · GPL v3
      </a>
      <QuoteShare chapter={n} images={images.map(({ id, idx, url, alt }) => ({ id, idx, url, alt }))} />
      {narration && (
        <ChapterPlayer
          chapter={n}
          chapters={WORK.chapters}
          label={narration.label}
          url={narration.url}
          duration={narration.duration}
          cues={narration.cues}
          images={images.map(({ idx, url, alt }) => ({ idx, url, alt }))}
        />
      )}
    </article>
  );
}
