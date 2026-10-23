"""
Chatterbox voice conversion for own-voice-v1, run by us on Modal (owner, 2026-10-19: "Run Chatterbox ourselves on a
serverless GPU host whose terms forbid using our data"; 2026-10-23: build the proof that it deletes each recording).

Used for a recording only when its performer agrees to that for that recording (config/consent-own-voice.json,
point 3). One HTTP endpoint, POST, behind Modal's proxy authentication (a Modal proxy token, held only by
snowmoon.party's server). In, as JSON: the performer's recording and the character's published reference clip, both
base64. Out: the converted line as WAV bytes, and nothing else.

What this file guarantees, and scripts/check-modal-vc.ts proves without Modal (npm run check:modal-vc, P1h):
- The recording arrives in the request body, never from a volume.
- It is written only into a fresh per-call folder (the model reads files), and that folder is removed in a `finally`,
  on success, on error and on cancellation. If it can't be removed, the container exits, and its disk goes with it.
  Leftovers of a container killed mid-call are swept at the next call, at start and at exit.
- While a call runs, Python's temporary folder points into that per-call folder, so any library's temporary files
  are removed with it.
- Nothing is written to a Modal Volume, Dict, Queue or any other storage, and nothing is sent anywhere else. The
  model's weights are baked into the image at build time, pinned to the revision in config/models.json.
- The only output is one JSON line per call: sizes, the output's duration, the input's sha256, timings and, on a
  failure, the error's type name. Never the audio, its base64, an error message or a traceback. The HTTP server's
  own request log is switched off.
- One request per container at a time (max_concurrency=1), so no call can see another's folder.

Why a Modal Server (@app.server) and not a Web Function (@modal.fastapi_endpoint): Modal's security page
(https://modal.com/docs/guide/security, read 2026-10-23) lists "Inputs and outputs" of Functions, including Web
Functions, as kept "Up to 7 days, then deleted", and the "Request and response payloads" of Servers as "Not stored -
proxied directly to your container". What Modal keeps outside this code is described in docs/proposals/own-voice-v1.md.

Deploy (the owner's Modal account; not done yet; costs are in docs/proposals/own-voice-v1.md):
  modal deploy modal/chatterbox_vc.py
Then create a Modal proxy token for the site and set MODAL_VC_URL, MODAL_VC_KEY and MODAL_VC_SECRET in Vercel.
"""
import base64
import binascii
import hashlib
import io
import json
import os
import shutil
import tempfile
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer

import modal

REPO = "ResembleAI/chatterbox"
REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"  # config/models.json, chatterbox-vc
WEIGHTS = "/weights"  # inside the image; read only at run time
PORT = 8000
MAX_SOURCE = 1_000_000  # a 15 s browser recording is far smaller
MAX_TARGET = 4_000_000
MAX_BODY = 7_000_000  # both, as base64, plus a little JSON
EXTS = ("webm", "ogg", "mp4", "m4a", "mp3", "wav")
WORK_PREFIX = "snowmoon-vc-"
LOG_FIELDS = ("source_bytes", "target_bytes", "out_bytes", "out_seconds", "source_sha256", "convert_s", "total_s", "status", "error")

app = modal.App("snowmoon-chatterbox-vc")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("chatterbox-tts==0.1.7", "setuptools<80", "huggingface_hub")
    .run_commands(
        "python -c \"from huggingface_hub import snapshot_download; "
        f"snapshot_download('{REPO}', revision='{REVISION}', local_dir='{WEIGHTS}', "
        "allow_patterns=['s3gen.safetensors', 'conds.pt'])\""
    )
    .env({"HF_HUB_OFFLINE": "1"})
)


class BadRequest(Exception):
    def __init__(self, status):
        super().__init__(status)
        self.status = status


def _log(event, **fields):
    """The only output: one JSON line of numbers, a sha256, and short labels."""
    for k, v in fields.items():
        if k not in LOG_FIELDS or isinstance(v, bool) or not isinstance(v, (int, float, str)) or (isinstance(v, str) and len(v) > 64):
            raise ValueError("refusing to log field " + k)
    print(json.dumps(dict(event=event, **fields)), flush=True)


def _sweep():
    """Remove any per-call folder left by a call that never reached its `finally` (a killed container)."""
    root = tempfile.gettempdir()
    for name in os.listdir(root):
        if name.startswith(WORK_PREFIX):
            shutil.rmtree(os.path.join(root, name), ignore_errors=True)


def _wav_seconds(data):
    try:
        with wave.open(io.BytesIO(data)) as w:
            return round(w.getnframes() / float(w.getframerate()), 3)
    except Exception:
        return -1


def convert_recording(engine, source, target, source_ext, target_ext):
    """Convert one recording; return the converted WAV bytes. Nothing of the call outlives it."""
    if source_ext not in EXTS or target_ext not in EXTS:
        raise BadRequest(400)
    if not (0 < len(source) <= MAX_SOURCE and 0 < len(target) <= MAX_TARGET):
        raise BadRequest(413)
    t0 = time.monotonic()
    source_sha = hashlib.sha256(source).hexdigest()
    _sweep()
    work = tempfile.mkdtemp(prefix=WORK_PREFIX)
    saved_tempdir = tempfile.tempdir
    try:
        tempfile.tempdir = work
        source_path = os.path.join(work, "in." + source_ext)
        target_path = os.path.join(work, "voice." + target_ext)
        with open(source_path, "wb") as f:
            f.write(source)
        with open(target_path, "wb") as f:
            f.write(target)
        t1 = time.monotonic()
        out = engine.convert(source_path, target_path)
        convert_s = round(time.monotonic() - t1, 3)
    except BaseException as e:
        _log("failed", source_bytes=len(source), source_sha256=source_sha, error=type(e).__name__, total_s=round(time.monotonic() - t0, 3))
        raise
    finally:
        tempfile.tempdir = saved_tempdir
        shutil.rmtree(work, ignore_errors=True)
        if os.path.exists(work):
            _log("cleanup_failed", source_sha256=source_sha)
            os._exit(1)  # the container stops, and its disk goes with it
    _log(
        "converted",
        source_bytes=len(source),
        target_bytes=len(target),
        out_bytes=len(out),
        out_seconds=_wav_seconds(out),
        source_sha256=source_sha,
        convert_s=convert_s,
        total_s=round(time.monotonic() - t0, 3),
    )
    return out


def _parse(raw):
    try:
        req = json.loads(raw)
        source = base64.b64decode(req["source_b64"], validate=True)
        target = base64.b64decode(req["target_b64"], validate=True)
        return source, target, str(req.get("source_ext", "webm")), str(req.get("target_ext", "wav"))
    except (ValueError, KeyError, TypeError, binascii.Error):
        raise BadRequest(400)


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """No request lines, paths or addresses in the logs."""

    def _reply(self, status, out=b""):
        self.send_response(status)
        self.send_header("Content-Type", "audio/wav" if out else "text/plain")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        if out:
            self.wfile.write(out)

    def do_POST(self):
        status, out = 500, b""
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 < length <= MAX_BODY:
                raise BadRequest(413)
            source, target, source_ext, target_ext = _parse(self.rfile.read(length))
            out = convert_recording(self.server.engine, source, target, source_ext, target_ext)
            status = 200
        except BadRequest as e:
            status = e.status
            _log("refused", status=str(e.status))
        except Exception as e:
            status = 500
            _log("error", error=type(e).__name__)
        finally:
            source = target = None
        self._reply(status, out if status == 200 else b"")


class _Server(HTTPServer):
    def handle_error(self, request, client_address):
        """No traceback in the logs: it could quote what failed."""
        _log("handler_error")


def make_server(engine, host, port):
    httpd = _Server((host, port), _Handler)
    httpd.engine = engine
    return httpd


class ChatterboxEngine:
    """The model, reading the two files and returning WAV bytes in memory."""

    def __init__(self, model):
        self._model = model

    def convert(self, source_path, target_path):
        import torchaudio

        wav = self._model.generate(audio=source_path, target_voice_path=target_path)
        buf = io.BytesIO()
        torchaudio.save(buf, wav.cpu(), self._model.sr, format="wav")
        return buf.getvalue()


@app.server(image=image, gpu="T4", port=PORT, max_concurrency=1, max_containers=1, scaledown_window=120, startup_timeout=600)
class VoiceConversion:
    @modal.enter()
    def start(self):
        _sweep()
        from chatterbox.vc import ChatterboxVC

        engine = ChatterboxEngine(ChatterboxVC.from_local(WEIGHTS, "cuda"))
        threading.Thread(target=make_server(engine, "0.0.0.0", PORT).serve_forever, daemon=True).start()

    @modal.exit()
    def stop(self):
        _sweep()
