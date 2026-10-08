'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { openComposer } from '~/lib/images/client';

/**
 * Readers' images in the chapter (decision 4, during the trial): after the last block of their
 * passage, behind a tap ("2 images by readers · show"), most liked first, then newest, and the
 * label says so. Each says it is AI-generated, by whom, and not by the author.
 */
type Img = { versionId: string; url: string; chapter: number; start: number; end: number; byFid: number; likes: number; userPrompt: string };

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
  return <>{groups.map((g) => createPortal(<Group images={g.images} />, g.host, String(g.end)))}</>;
}

function Group({ images }: { images: Img[] }) {
  const [open, setOpen] = useState(false);
  const n = images.length;
  return (
    <div className="ri-group">
      <button type="button" className="ri-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {n} {n === 1 ? 'image' : 'images'} by readers · {open ? 'hide' : 'show'}
      </button>
      {open && (
        <ul className="ri-list" aria-label="Images by readers, most liked first, then newest">
          {images.map((im) => (
            <li key={im.versionId}>
              <Link href={`/image/${im.versionId}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={`AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`} width={1024} height={576} loading="lazy" />
              </Link>
              <p className="block-caption">
                AI-generated image · by FID {im.byFid} · not by the author · {im.likes} {im.likes === 1 ? 'like' : 'likes'} · <Link href={`/image/${im.versionId}`}>recipe</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "+ Add an image" on a scene label (L8): opens the composer on the scene's blocks, up to the first 8. */
export function AddImageButton({ chapter, start, end, children = '+ Add an image' }: { chapter: number; start: number; end: number; children?: React.ReactNode }) {
  return (
    <button type="button" className="add-image" onClick={() => openComposer({ chapter, start, end })}>
      {children}
    </button>
  );
}
