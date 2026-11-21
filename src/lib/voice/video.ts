/**
 * "Save as a video" (Ephelion slice 4, 2026-11-21; DRAFT): the kept pictures stitched to the performance, in the
 * browser: each shot's picture held for its span, then the closing card, drawn on a canvas and recorded with the joined
 * audio by the browser's own MediaRecorder. No AI video, no server work, nothing uploaded: the file is made on the
 * person's device and saved there. It plays in real time, so a 3-minute speech takes about 3 minutes to save.
 * Every frame carries a small corner label (the snowmoon.party mark and "AI pictures · AI voice conversion"), so a
 * clip cut from it still says so. Browser only.
 */

export interface VideoShot {
  start: number;
  end: number;
  /** A URL the page can draw (same origin or CORS-enabled), or null to draw the shot's words instead. */
  image: string | null;
  words: string;
}
export interface VideoInput {
  audio: string;
  seconds: number;
  shots: VideoShot[];
  closing: string;
  closingSeconds: number;
  label: string;
  width?: number;
  height?: number;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}

/** The container the browser can record, best first: MP4 (Safari, newer Chrome), then WebM. */
export function videoType(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ] as const)
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(`a picture could not be loaded`));
    i.src = src;
  });

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function words(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  ctx.fillStyle = '#1c2230';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ece9e2';
  ctx.font = `${Math.round(h / 22)}px Georgia, serif`;
  const max = w * 0.8;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (ctx.measureText(`${line} ${word}`).width > max && line) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const lh = h / 16;
  lines.slice(0, 8).forEach((l, i) => ctx.fillText(l, w * 0.1, h / 2 - (Math.min(lines.length, 8) * lh) / 2 + i * lh));
}

function corner(ctx: CanvasRenderingContext2D, label: string, w: number, h: number) {
  ctx.font = `${Math.round(h / 40)}px Helvetica, Arial, sans-serif`;
  const pad = h / 60;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(w - tw - pad * 3, h - h / 40 - pad * 3, tw + pad * 2, h / 40 + pad * 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, w - tw - pad * 2, h - pad * 2);
}

/** Record the video; resolves to the file. Rejects if the browser can't record, a file can't be read, or it is cancelled. */
export async function saveVideo(o: VideoInput): Promise<{ blob: Blob; ext: 'mp4' | 'webm'; mime: string }> {
  const type = videoType();
  if (!type) throw new Error('This browser can’t record a video. Try a current Chrome, Edge, Firefox or Safari.');
  const W = o.width ?? 1280;
  const H = o.height ?? 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pictures = await Promise.all(o.shots.map((s) => (s.image ? loadImage(s.image) : Promise.resolve(null))));
  const closing = await loadImage(o.closing);

  const ac = new AudioContext();
  const buffer = await ac.decodeAudioData(await (await fetch(o.audio)).arrayBuffer());
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(dest);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

  const total = o.seconds + o.closingSeconds;
  const draw = (t: number) => {
    if (t >= o.seconds) cover(ctx, closing, W, H);
    else {
      const i = Math.max(0, o.shots.findIndex((s) => t >= s.start && t < s.end));
      const p = pictures[i];
      if (p) cover(ctx, p, W, H);
      else words(ctx, o.shots[i]?.words ?? '', W, H);
      corner(ctx, o.label, W, H);
    }
  };
  draw(0);
  rec.start(1000);
  const t0 = ac.currentTime + 0.1;
  src.start(t0);
  try {
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (o.signal?.aborted) return reject(new Error('Cancelled'));
        const t = ac.currentTime - t0;
        draw(Math.max(0, t));
        o.onProgress?.(Math.min(1, Math.max(0, t) / total));
        if (t >= total) return resolve();
        // A timer, not requestAnimationFrame, so a hidden tab keeps drawing (browsers pause rAF there).
        setTimeout(tick, 1000 / 30);
      };
      tick();
    });
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    void ac.close();
  }
  await done;
  if (o.signal?.aborted) throw new Error('Cancelled');
  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext, mime: type.mime };
}

export const VIDEO_LABEL = 'snowmoon.party · AI pictures · AI voice conversion';
