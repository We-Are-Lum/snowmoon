"""
Chatterbox voice conversion, run by us on Modal (owner, 2026-10-19: option (c), "Run Chatterbox ourselves on a
serverless GPU host whose terms forbid using our data"). Modal's terms (effective May 2026), §5.5: "Modal will not,
except with Customer's prior written consent: (i) train any AI model using Customer Data, or (ii) export Customer
Data into, or cause Customer Data to be ingested by, large language models."

One web endpoint, POST, called only by snowmoon.party's server (a shared key in the body's "key"). In:
the person's recording and the character's published voice, both as base64. Out: the converted take (WAV, base64)
and the GPU seconds it took. The recording is held in memory and, because the model reads files, in the container's
temporary directory for the seconds the conversion takes; both files are deleted before the answer is sent. Nothing
is logged, kept in a volume or sent anywhere else. The model's weights (ResembleAI/chatterbox, MIT) are baked into
the image at build time, so a request needs no download.

Deploy (the owner's Modal account; see docs/legal/record-takes-draft.md):
  modal secret create snowmoon-takes SNOWMOON_TAKES_KEY=<a long random key>
  modal deploy modal/chatterbox_vc.py
Then set MODAL_TAKES_URL (the printed endpoint) and MODAL_TAKES_KEY (the same key) in Vercel production.
"""
import base64
import os
import tempfile
import time

import modal

app = modal.App("snowmoon-chatterbox-vc")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("chatterbox-tts==0.1.2", "fastapi[standard]==0.115.0")
    # Weights at build time, so no request downloads anything.
    .run_commands("python -c \"from chatterbox.vc import ChatterboxVC; ChatterboxVC.from_pretrained('cpu')\"")
)

MAX_BYTES = 1_000_000  # a 15 s browser recording is far smaller


@app.cls(image=image, gpu="T4", secrets=[modal.Secret.from_name("snowmoon-takes")], scaledown_window=120, timeout=120)
class VoiceConversion:
    @modal.enter()
    def load(self):
        from chatterbox.vc import ChatterboxVC

        self.model = ChatterboxVC.from_pretrained("cuda")

    @modal.fastapi_endpoint(method="POST")
    def convert(self, body: dict):
        import hmac

        import torchaudio
        from fastapi import HTTPException

        key = body.get("key") if isinstance(body, dict) else None
        if not isinstance(key, str) or not hmac.compare_digest(key, os.environ["SNOWMOON_TAKES_KEY"]):
            raise HTTPException(status_code=401)
        try:
            source = base64.b64decode(body["source_b64"], validate=True)
            target = base64.b64decode(body["target_b64"], validate=True)
            src_ext = body.get("source_ext", "webm")
        except Exception:
            raise HTTPException(status_code=400)
        if not (0 < len(source) <= MAX_BYTES and 0 < len(target) <= 4 * MAX_BYTES) or src_ext not in ("webm", "ogg", "mp4", "m4a", "mp3", "wav"):
            raise HTTPException(status_code=413)
        t0 = time.time()
        with tempfile.TemporaryDirectory() as d:
            sp, tp, op = os.path.join(d, f"in.{src_ext}"), os.path.join(d, "voice.m4a"), os.path.join(d, "out.wav")
            try:
                with open(sp, "wb") as f:
                    f.write(source)
                with open(tp, "wb") as f:
                    f.write(target)
                wav = self.model.generate(audio=sp, target_voice_path=tp)
                torchaudio.save(op, wav, self.model.sr)
                with open(op, "rb") as f:
                    out = f.read()
            finally:
                for p in (sp, tp, op):
                    if os.path.exists(p):
                        os.remove(p)
        del source, target
        return {"wav_b64": base64.b64encode(out).decode(), "gpu_seconds": round(time.time() - t0, 3)}
