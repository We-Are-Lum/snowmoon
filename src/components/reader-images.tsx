'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { openComposer } from '~/lib/images/client';
import { byline } from '~/lib/images/byline';
import { useCanAddImage } from '~/lib/images/can-add';
import { IMAGE_WORDING as W } from '~/lib/images/wording';

/**
 * Readers' images in the chapter (decision 4, during the trial): after the last block of their
 * passage, behind a tap ("2 images by readers · ¶ 2–3 · show"), most liked first, then newest, and
 * the label says so. Each says it is AI-generated, by whom, and not by the author. Laid out as
 * Claude Design's strip: a ruled bar, the order named, the images side by side, swiped.
 */
type Img = { versionId: string; url: string; chapter: number; start: number; end: number; byFid: number; byName: string | null; likes: number; userPrompt: string };

export function ReaderImages({ chapter }: { chapter: number }) {
  const [groups, setGroups] = useState<{ end: number; images: Img[]; host: HTMLElement }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/images/chapter/${chapter}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ images: Img[] }>) : { images: [] }))
      .then(({ images }) => {
        if (!alive || !images.length) return;
        const byEnd = new Map<number, Img[]>();
        for (const im of images) byEnd.set(im.end, [...(byEnd.get(im.end) ?? []), im]);
        const out: { end: number; images: Img[]; host: HTMLElement }[] = [];
        for (const [end, list] of byEnd) {
          const block = document.getElementById(`c${chapter}-b${end}`);
          if (!block) continue;
          // After the block, and after the seeded image that follows it, if any.
          let after: Element = block;
          while (after.nextElementSibling?.matches('.seed-image, .cited-by, .described-note')) after = after.nextElementSibling;
          const host = document.createElement('div');
          host.className = 'reader-images';
          after.after(host);
          out.push({ end, images: list, host });
        }
        setGroups(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
      document.querySelectorAll('.reader-images').forEach((n) => n.remove());
    };
  }, [chapter]);
  // One "Draft wording" line on the chapter's screen: in the first strip that is open.
  const [open, setOpen] = useState<number[]>([]);
  const first = groups.map((g) => g.end).find((e) => open.includes(e));
  return (
    <>
      {groups.map((g) =>
        createPortal(
          <Group chapter={chapter} images={g.images} draftLine={first === g.end} onToggle={(o) => setOpen((xs) => (o ? [...xs, g.end] : xs.filter((x) => x !== g.end)))} />,
          g.host,
          String(g.end),
        ),
      )}
    </>
  );
}

function Group({ chapter, images, draftLine, onToggle }: { chapter: number; images: Img[]; draftLine: boolean; onToggle: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const can = useCanAddImage();
  const n = images.length;
  // The passage's paragraph numbers, as the reader shows them; the images in a group can start on different blocks.
  const labels = images.flatMap((im) => [im.start, im.end]).map((i) => Number(document.getElementById(`c${chapter}-b${i}`)?.getAttribute('data-label'))).filter((l) => l > 0);
  const lo = Math.min(...labels), hi = Math.max(...labels);
  const where = labels.length ? (lo === hi ? `¶ ${lo}` : `¶ ${lo}–${hi}`) : null;
  const top = images[0];
  return (
    <div className={`ri-group${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="ri-toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          onToggle(!open);
        }}
      >
        <span>
          {n} {n === 1 ? 'image' : 'images'} by readers{where ? ` · ${where}` : ''}
        </span>
        <span className="ri-show">{open ? 'hide ▴' : 'show ▾'}</span>
      </button>
      {open && (
        <>
          <p className="ri-order">{W.reader.order}</p>
          <ul className="ri-list" aria-label="Images by readers, most liked first, then newest">
            {images.map((im) => (
              <li key={im.versionId}>
                <Link href={`/image/${im.versionId}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={`AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`} width={1024} height={576} loading="lazy" />
                </Link>
                <p className="block-caption">
                  AI-generated image · by {byline(im.byName, im.byFid)} · not by the author · {im.likes} {im.likes === 1 ? 'like' : 'likes'} · <Link href={`/image/${im.versionId}`}>recipe</Link>
                </p>
              </li>
            ))}
          </ul>
          {can && top && (
            <button type="button" className="add-image ri-add" onClick={() => openComposer({ chapter, start: top.start, end: top.end })}>
              + Add an image
            </button>
          )}
          {draftLine && <p className="as-draft ic-draftline">{W.draftLine}</p>}
        </>
      )}
    </div>
  );
}

/** "+ Add an image" on a scene label (L8): opens the composer on the scene's blocks, up to the first 8. Invited FIDs only. */
export function AddImageButton({ chapter, start, end, children = '+ Add an image' }: { chapter: number; start: number; end: number; children?: React.ReactNode }) {
  if (!useCanAddImage()) return null;
  return (
    <>
      {' · '}
      <button type="button" className="add-image" onClick={() => openComposer({ chapter, start, end })}>
        {children}
      </button>
    </>
  );
}
