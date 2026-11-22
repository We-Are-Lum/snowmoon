/**
 * Join a converted take with redone sentences, in the browser (no audio editing on the server): each redo replaces
 * [start, end) of the take. Returns a WAV object URL for an <audio> element. Browser only.
 */
export async function joinAudio(main: Blob, redos: { blob: Blob; start: number; end: number }[]): Promise<string> {
  const ac = new AudioContext();
  try {
    const dec = async (b: Blob) => ac.decodeAudioData(await b.arrayBuffer());
    const mono = (b: AudioBuffer) => {
      if (b.numberOfChannels === 1) return b.getChannelData(0);
      const out = new Float32Array(b.length);
      for (let c = 0; c < b.numberOfChannels; c++) b.getChannelData(c).forEach((v, i) => (out[i] += v / b.numberOfChannels));
      return out;
    };
    const m = await dec(main);
    const sr = m.sampleRate;
    const data = mono(m);
    const pieces: Float32Array[] = [];
    let cursor = 0;
    for (const r of [...redos].sort((a, b) => a.start - b.start)) {
      const start = Math.floor(r.start * sr);
      const end = Math.floor(Math.max(r.start, r.end) * sr);
      if (start < cursor) continue;
      pieces.push(data.subarray(cursor, start));
      pieces.push(mono(await dec(r.blob)));
      cursor = end;
    }
    pieces.push(data.subarray(cursor));
    const total = pieces.reduce((s, p) => s + p.length, 0);
    const wav = new DataView(new ArrayBuffer(44 + total * 2));
    const w = (o: number, s: string) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); wav.setUint32(4, 36 + total * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, sr, true);
    wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, total * 2, true);
    let o = 44;
    for (const p of pieces) for (const v of p) { wav.setInt16(o, Math.max(-1, Math.min(1, v)) * 0x7fff, true); o += 2; }
    return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  } finally {
    void ac.close();
  }
}
