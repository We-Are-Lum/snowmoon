import type { EditionMedia } from '~/lib/editions/catalog';
import { EW } from '~/lib/editions/wording';

/** An edition's piece: the picture, or the video with its play control. First-party media only. */
export function EditionMediaView({ media, compact = false }: { media: EditionMedia | null; compact?: boolean }) {
  if (!media) return <span className={`ed-media ed-media-empty${compact ? ' ed-media-compact' : ''}`} aria-hidden="true" />;
  const style = { aspectRatio: `${media.width} / ${media.height}` };
  if (media.type === 'video') {
    return compact ? (
      <video className="ed-media ed-media-compact" src={`${media.url}#t=0.5`} muted playsInline preload="metadata" aria-label={media.alt} style={style} />
    ) : (
      <video className="ed-media" src={media.url} controls playsInline preload="metadata" aria-label={media.alt} style={style} title={EW.playVideo} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`ed-media${compact ? ' ed-media-compact' : ''}`} src={media.url} alt={media.alt} width={media.width} height={media.height} style={style} />;
}
