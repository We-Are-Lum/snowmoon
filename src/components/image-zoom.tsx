'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_DECLARED } from '~/lib/ai-declared';

/**
 * A picture larger on tap (suggested by @garance's agent, 2026-10-24: "make images larger on click"). Any
 * <img data-zoom> on the page opens full screen, as large as the screen allows, with its AI label kept visible.
 * Tap, Escape or Back closes it, and focus returns to the picture. Nothing is fetched: it is the same file.
 * Mounted once, in the app shell.
 */
export function ImageZoom() {
  const [shown, setShown] = useState<{ src: string; alt: string } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setShown(null);
    opener.current?.focus();
  }, []);

  useEffect(() => {
    const open = (img: HTMLImageElement) => {
      opener.current = img;
      setShown({ src: img.currentSrc || img.src, alt: img.alt });
    };
    const onClick = (e: MouseEvent) => {
      const img = (e.target as Element | null)?.closest?.('img[data-zoom]') as HTMLImageElement | null;
      if (!img || img.closest('a, button')) return;
      e.preventDefault();
      open(img);
    };
    const onKey = (e: KeyboardEvent) => {
      const img = e.target as HTMLElement;
      if ((e.key === 'Enter' || e.key === ' ') && img instanceof HTMLImageElement && img.dataset.zoom !== undefined) {
        e.preventDefault();
        open(img);
      }
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // Back closes the picture instead of leaving the page.
    history.pushState({ zoom: true }, '');
    const onPop = () => setShown(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      if (history.state?.zoom) history.back();
    };
  }, [shown, close]);

  if (!shown) return null;
  return (
    <div className="image-zoom" role="dialog" aria-modal="true" aria-label={shown.alt || AI_DECLARED.image} onClick={close}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shown.src} alt={shown.alt} />
      <p className="image-zoom-label">{AI_DECLARED.image} · tap to close</p>
      <button type="button" className="image-zoom-close" aria-label="Close" autoFocus onClick={close}>
        ×
      </button>
    </div>
  );
}
