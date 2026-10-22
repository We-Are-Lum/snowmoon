// The owner's phone test (/voice-test; owner, 2026-10-22): Chatterbox VC, int4 ONNX, in the browser.
// Runs in a Web Worker (worker.js) or, when the worker has no WebGPU, on the page itself. A plain module, not
// bundled, so the same file serves both. Everything it fetches comes from the address it is given: the site's
// media (media.snowmoon.party/voice/…) or the site's own /voice-media/ path to it. Nothing is sent anywhere.
// The audio it converts is a finished public line; no microphone is used.

const now = () => performance.now();
const round = (x) => Math.round(x);

async function gpuInfo() {
  const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
  if (!gpu) return { present: false };
  try {
    const a = await gpu.requestAdapter();
    if (!a) return { present: true, adapter: null };
    const i = a.info ?? {};
    return {
      present: true,
      adapter: { vendor: i.vendor ?? '', architecture: i.architecture ?? '', device: i.device ?? '', description: i.description ?? '' },
      shaderF16: a.features.has('shader-f16'),
      maxBufferMB: round(a.limits.maxBufferSize / 2 ** 20),
      maxStorageBindingMB: round(a.limits.maxStorageBufferBindingSize / 2 ** 20),
    };
  } catch (e) {
    return { present: true, adapter: null, error: String(e) };
  }
}
export { gpuInfo };

/** Fetch a file whose size is known into one buffer, reporting progress. */
async function download(url, bytes, onBytes) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status} for ${url.split('/').pop()}`);
  const buf = new Uint8Array(bytes);
  const reader = res.body.getReader();
  let off = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (off + value.length > bytes) throw new Error(`${url.split('/').pop()} is larger than expected`);
    buf.set(value, off);
    off += value.length;
    onBytes(value.length);
  }
  if (off !== bytes) throw new Error(`${url.split('/').pop()}: got ${off} of ${bytes} bytes`);
  return buf;
}

/**
 * cfg: { base, files (the manifest), ep: 'webgpu' | 'wasm', runs }
 * input: { line: Float32Array (24 kHz), ref: Float32Array (24 kHz, ≤ 10 s) }
 * emit(stage, partialResults): progress, so the page can keep it in sessionStorage.
 */
export async function bench(cfg, input, emit) {
  const R = { ep: cfg.ep, gpu_here: await gpuInfo() };
  const m = cfg.files;
  const SR = 24000;

  emit('runtime', R);
  let t = now();
  const ort = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ cfg.base + m.runtime.ort.key);
  ort.env.wasm.wasmPaths = cfg.base + m.runtime.prefix;
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';
  R.wasm_threads = ort.env.wasm.numThreads;
  R.runtime_ms = round(now() - t);

  // Download each model and open it before the next, so the two never sit in memory as raw bytes at once.
  const total = m.model.encoder.bytes + m.model.encoderData.bytes + m.model.decoder.bytes + m.model.decoderData.bytes;
  let got = 0;
  let lastEmit = 0;
  const onBytes = (n) => {
    got += n;
    if (now() - lastEmit > 500) {
      lastEmit = now();
      emit(`download ${Math.round((100 * got) / total)}% (${Math.round(got / 2 ** 20)} of ${Math.round(total / 2 ** 20)} MB)`, R);
    }
  };
  R.download_ms = 0;
  R.download_mb = Math.round(total / 2 ** 20);
  R.session_ms = {};
  const open = async (name, graph, data) => {
    emit(`download ${name}`, R);
    let t0 = now();
    let g = await download(cfg.base + graph.key, graph.bytes, onBytes);
    let d = await download(cfg.base + data.key, data.bytes, onBytes);
    R.download_ms += round(now() - t0);
    emit(`open ${name}`, R);
    t0 = now();
    const s = await ort.InferenceSession.create(g, {
      executionProviders: cfg.ep === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
      graphOptimizationLevel: 'all',
      externalData: [{ path: data.key.split('/').pop(), data: d }],
    });
    g = d = null;
    R.session_ms[name] = round(now() - t0);
    return s;
  };
  const enc = await open('encoder', m.model.encoder, m.model.encoderData);
  const dec = await open('decoder', m.model.decoder, m.model.decoderData);
  R.download_mbps = +(total / 2 ** 20 / (R.download_ms / 1000)).toFixed(1);

  // The character's conditioning, from Bai's reference (could be shipped precomputed later).
  emit('conditioning', R);
  t = now();
  const pr = await enc.run({ audio_values: new ort.Tensor('float32', input.ref, [1, input.ref.length]) });
  const ptok = await pr.audio_tokens.getData();
  R.conditioning_ms = round(now() - t);

  // Convert the line, `runs` times (the first, then warm). The speech encoder keeps only the first 10 s of its
  // input, so a longer take is cut into ≤ 10 s chunks at the quietest 50 ms between 6 and 10 s (as the spike did).
  const take = input.line;
  R.input_s = +(take.length / SR).toFixed(2);
  R.convert_ms = [];
  let audio;
  for (let i = 0; i < cfg.runs; i++) {
    emit(`convert, run ${i + 1} of ${cfg.runs}`, R);
    t = now();
    const CH = 10 * SR, W = SR / 20, parts = [];
    for (let o = 0; o < take.length; ) {
      let end = Math.min(o + CH, take.length);
      if (end < take.length) {
        let best = end, bestE = Infinity;
        for (let c = o + 6 * SR; c + W <= o + CH; c += W / 2) {
          let e = 0;
          for (let k = c; k < c + W; k++) e += take[k] * take[k];
          if (e < bestE) { bestE = e; best = c + W / 2; }
        }
        end = Math.floor(best);
      }
      const piece = take.subarray(o, end);
      o = end;
      if (piece.length < SR * 0.2) break;
      const stok = await (await enc.run({ audio_values: new ort.Tensor('float32', piece, [1, piece.length]) })).audio_tokens.getData();
      const toks = new BigInt64Array(ptok.length + stok.length);
      toks.set(ptok);
      toks.set(stok, ptok.length);
      const out = (await dec.run({ speech_tokens: new ort.Tensor('int64', toks, [1, toks.length]), speaker_embeddings: pr.speaker_embeddings, speaker_features: pr.speaker_features })).waveform;
      parts.push(await out.getData());
    }
    audio = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
    let off = 0;
    for (const p of parts) { audio.set(p, off); off += p.length; }
    R.chunks = parts.length;
    R.convert_ms.push(round(now() - t));
  }
  R.output_s = +(audio.length / SR).toFixed(2);
  R.rtf_first = +(R.convert_ms[0] / 1000 / R.input_s).toFixed(2);
  R.rtf_best = +(Math.min(...R.convert_ms) / 1000 / R.input_s).toFixed(2);
  // A sanity check on the sound itself (broken fp16 graphs gave NaN or noise in the spike).
  let nan = 0, peak = 0, sq = 0;
  for (const x of audio) { if (Number.isNaN(x)) nan++; else { peak = Math.max(peak, Math.abs(x)); sq += x * x; } }
  R.output_check = { nan, peak: +peak.toFixed(3), rms: +Math.sqrt(sq / Math.max(1, audio.length)).toFixed(4) };
  await enc.release?.();
  await dec.release?.();
  return { results: R, audio, sampleRate: SR };
}
