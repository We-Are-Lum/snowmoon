import type { EditionMedia } from '~/lib/editions/catalog';
import { PieceVideo } from '~/components/editions/piece-video';

/** An edition's piece: the picture, or the video with its play button. First-party media only. `tile` is the small
 *  version for lists and strips; `label` shows in an empty tile (the mockups' placeholders). */
export function EditionMediaView({ media, tile = false, label }: { media: EditionMedia | null; tile?: boolean; label?: string }) {
  if (!media)
    return (
      <span className={`ed-media ed-media-empty${tile ? ' ed-tile' : ''}`}>
        {label && <span className="label">{label}</span>}
      </span>
    );
  if (media.type === 'video') {
    return tile ? (
      <video className="ed-media ed-tile" src={`${media.url}#t=0.5`} muted playsInline preload="metadata" aria-label={media.alt} />
    ) : (
      <PieceVideo src={media.url} alt={media.alt} ratio={`${media.width} / ${media.height}`} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`ed-media${tile ? ' ed-tile' : ''}`} src={media.url} alt={media.alt} width={media.width} height={media.height} />;
}
