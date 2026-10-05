'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Share a quote as a card. Select text in the chapter (up to four paragraphs),
 * or use the player's share button for the paragraph being read. The sheet
 * previews the card, lets the reader pick one of the chapter's images, and
 * casts it (inside Farcaster) or copies the link. The server checks every
 * quote against the book before drawing a card.
 */
export interface ShareImage {
  id: string;
  idx: number;
  url: string;
  alt: string;
}
interface Props {
  chapter: number;
  images: ShareImage[];
}
interface Pick {
  from: number;
  to: number;
  q: string | null;
}

const MAX_BLOCKS = 4;
const QUOTABLE = ['paragraph', 'quote'];
export const SHARE_BLOCK_EVENT = 'snowmoon:share-block';

const blockOf = (node: Node | null): HTMLElement | null =>
  (node instanceof HTMLElement ? node : node?.parentElement)?.closest<HTMLElement>('article.chapter .block[id]') ?? null;
const idxOf = (el: HTMLElement) => Number(el.id.match(/-b(\d+)$/)?.[1]);

export function QuoteShare({ chapter, images }: Props) {
  const [selection, setSelection] = useState<Pick | null>(null);
  const [open, setOpen] = useState<Pick | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [inMiniApp, setInMiniApp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    sdk.isInMiniApp().then(setInMiniApp).catch(() => setInMiniApp(false));
  }, []);

  // Track text selections that fall within up to four quotable blocks.
  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!sel || sel.isCollapsed || text.length < 3) return setSelection(null);
      const a = blockOf(sel.anchorNode);
      const b = blockOf(sel.focusNode);
      if (!a || !b) return setSelection(null);
      const [first, last] = idxOf(a) <= idxOf(b) ? [a, b] : [b, a];
      const blocks = Array.from(document.querySelectorAll<HTMLElement>('article.chapter .block[id]')).filter(
        (el) => idxOf(el) >= idxOf(first) && idxOf(el) <= idxOf(last),
      );
      if (blocks.length > MAX_BLOCKS || !blocks.every((el) => QUOTABLE.some((k) => el.classList.contains(k)))) return setSelection(null);
      setSelection({ from: idxOf(first), to: idxOf(last), q: text });
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  const openSheet = useCallback(
    (p: Pick) => {
      let near: ShareImage | null = null;
      for (const im of images) if (im.idx <= p.from) near = im;
      setImg(near?.id ?? null);
      setCopied(false);
      setOpen(p);
    },
    [images],
  );

  // The player asks to share the paragraph being read.
  useEffect(() => {
    const onShare = (e: Event) => {
      const { idx } = (e as CustomEvent<{ idx: number }>).detail;
      const el = document.getElementById(`c${chapter}-b${idx}`);
      if (el && QUOTABLE.some((k) => el.classList.contains(k))) openSheet({ from: idx, to: idx, q: null });
    };
    window.addEventListener(SHARE_BLOCK_EVENT, onShare);
    return () => window.removeEventListener(SHARE_BLOCK_EVENT, onShare);
  }, [chapter, openSheet]);

  const links = useMemo(() => {
    if (!open) return null;
    const range = open.from === open.to ? `${open.from}` : `${open.from}-${open.to}`;
    const p = new URLSearchParams();
    if (open.q) p.set('q', open.q);
    if (img) p.set('img', img);
    const qs = p.toString() ? `?${p}` : '';
    return { card: `/api/card/${chapter}/${range}${qs}`, share: `${window.location.origin}/share/${chapter}/${range}${qs}` };
  }, [open, img, chapter]);

  const cast = async () => {
    if (!links) return;
    const text = `From Snowmoon, Chapter ${chapter}`;
    if (inMiniApp) {
      await sdk.actions.composeCast({ text, embeds: [links.share] });
    } else {
      const u = new URL('https://farcaster.xyz/~/compose');
      u.searchParams.set('text', text);
      u.searchParams.append('embeds[]', links.share);
      window.open(u.toString(), '_blank', 'noopener');
    }
  };

  const copy = async () => {
    if (!links) return;
    await navigator.clipboard.writeText(links.share);
    setCopied(true);
  };

  return (
    <>
      {selection && !open && (
        <button
          type="button"
          className="share-selection"
          // Keep the selection: don't let the tap clear it before we read it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => openSheet(selection)}
        >
          Share quote
        </button>
      )}
      {open && links && (
        <div className="share-sheet" role="dialog" aria-modal="true" aria-label="Share a quote card">
          <div className="share-sheet-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="share-preview" src={links.card} alt="Quote card preview" width={1200} height={800} />
            <p className="label">Image</p>
            <div className="share-images">
              <button type="button" className={img === null ? 'is-picked' : ''} onClick={() => setImg(null)}>
                None
              </button>
              {images.map((im) => (
                <button key={im.id} type="button" className={img === im.id ? 'is-picked' : ''} onClick={() => setImg(im.id)} aria-label={im.alt}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" width={96} height={54} />
                </button>
              ))}
            </div>
            <div className="share-buttons">
              <button type="button" className="share-cast" onClick={cast}>
                {inMiniApp ? 'Cast' : 'Cast on Farcaster'}
              </button>
              <button type="button" onClick={copy}>
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              <button type="button" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
