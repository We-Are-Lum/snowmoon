'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { thumbSrcSet, thumbUrl } from '~/lib/images/thumb-url';

/**
 * A picture in a list or feed, shown from its small copy (src/lib/images/thumb-url.ts), with `sizes` telling the
 * browser how wide it is drawn so it picks the 320 or the 640. Any picture that has no copies (book media, a route)
 * is shown as it is. If a copy isn't there (a picture from before the copies, until the backfill has run), the
 * original takes its place, also when the copy failed before the page started up (checked on mount).
 * A picture's own page keeps the original; only lists use this.
 */
export function ThumbImg({ src, sizes, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & { src: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const small = failed ? null : thumbUrl(src, 320);
  useEffect(() => {
    const el = ref.current;
    if (small && el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [small]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      {...rest}
      src={small ?? src}
      srcSet={small ? (thumbSrcSet(src) ?? undefined) : undefined}
      sizes={small ? sizes : undefined}
      data-thumb={small ? '' : undefined}
      onError={(e) => {
        if (small) setFailed(true);
        rest.onError?.(e);
      }}
    />
  );
}
