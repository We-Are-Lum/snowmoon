// The owner's phone test (/voice-test): runs bench.js off the page's thread, so the page stays responsive.
// Messages in: { type: 'hello' } and { type: 'run', cfg, input }. Out: hello, progress, done, error.
import { bench, gpuInfo } from './bench.js';

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'hello') {
    self.postMessage({ type: 'hello', gpu: await gpuInfo() });
    return;
  }
  if (msg.type !== 'run') return;
  try {
    const out = await bench(msg.cfg, msg.input, (stage, partial) => self.postMessage({ type: 'progress', stage, partial: JSON.parse(JSON.stringify(partial)) }));
    self.postMessage({ type: 'done', results: out.results, audio: out.audio, sampleRate: out.sampleRate }, [out.audio.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err && err.stack ? err.stack : err) });
  }
};
