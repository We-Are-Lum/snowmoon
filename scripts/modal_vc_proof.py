"""
The run half of the proof that modal/chatterbox_vc.py deletes each recording (owner, 2026-10-23). No Modal, no GPU,
no network beyond 127.0.0.1, no spending: `modal` is replaced by a stub that records any use of storage, and the
model by a stub engine.

  python3 -I scripts/modal_vc_proof.py modal/chatterbox_vc.py     (prints JSON {"problems": [...], "scenarios": [...]})

Called by scripts/check-modal-vc.ts (npm run check:modal-vc) and by P1h in check:principles, which also run it on a
copy with a planted violation and require it to fail. For each scenario, in a sandbox:
- (b) the temp root, the weights path, the working folder and HOME are snapshotted before and after: no new or
  changed file may remain, including when the model raises, times out or is cancelled;
- (c) everything written to stdout and stderr (at the file-descriptor level) and to `logging`, and every HTTP reply,
  must contain none of the input bytes, their base64 or hex, and no long hex run other than the input's sha256;
- no Volume, Dict, Queue or other storage of the stub `modal` may be used;
- afterwards no live Python object (module, server, engine, anything the garbage collector can reach) holds the input.
"""
import base64
import contextlib
import gc
import hashlib
import importlib.util
import io
import json
import logging
import os
import re
import shutil
import sys
import tempfile
import threading
import types
import urllib.error
import urllib.request
import wave

sys.dont_write_bytecode = True  # no __pycache__ beside the file under test
problems = []
scenarios = []
storage_use = []


# --- A stub of `modal`: decorators pass through; storage records its use. -------------------------------------------
class _Chain:
    def __getattr__(self, name):
        return lambda *a, **k: self


class _Storage:
    def __init__(self, kind, name):
        self.kind, self.name = kind, name
        storage_use.append("%s.from_name(%r)" % (kind, name))

    def __getattr__(self, attr):
        def call(*a, **k):
            if attr != "read_only":
                storage_use.append("%s.%s()" % (self.kind, attr))
            return self
        return call

    def __setitem__(self, k, v):
        storage_use.append("%s[...] = ..." % self.kind)


def _storage_cls(kind):
    return type(kind, (), {"from_name": staticmethod(lambda name, **k: _Storage(kind, name)), "ephemeral": staticmethod(lambda **k: _Storage(kind, "ephemeral"))})


server_config = {}


class _App:
    def __init__(self, *a, **k):
        pass

    def server(self, **kw):
        server_config.update(kw)
        return lambda cls: cls

    def cls(self, **kw):
        server_config.update(kw)
        server_config["_not_a_server"] = "app.cls"
        return lambda cls: cls

    def function(self, **kw):
        server_config.update(kw)
        server_config["_not_a_server"] = "app.function"
        return lambda f: f


def _web_function(*a, **k):
    server_config["_web_function"] = True
    return lambda f: f


stub = types.ModuleType("modal")
stub.App = _App
stub.Image = _Chain()
stub.Secret = types.SimpleNamespace(from_name=lambda *a, **k: object(), from_dict=lambda *a, **k: object())
stub.enter = lambda *a, **k: (lambda f: f)
stub.exit = lambda *a, **k: (lambda f: f)
stub.concurrent = lambda *a, **k: (lambda f: f)
for _name in ("fastapi_endpoint", "web_endpoint", "asgi_app", "wsgi_app", "web_server"):
    setattr(stub, _name, _web_function)
for _kind in ("Volume", "Dict", "Queue", "NetworkFileSystem", "CloudBucketMount"):
    setattr(stub, _kind, _storage_cls(_kind))
sys.modules["modal"] = stub

# The module exits the container when a per-call folder can't be removed. Here that is recorded, not done, so the
# rest of the run still reports what was left.
_real_exit = os._exit


def _recorded_exit(code):
    problems.append("a per-call folder could not be removed (the container would exit)")


os._exit = _recorded_exit


# --- Sandbox. ----------------------------------------------------------------------------------------------------------
sandbox = tempfile.mkdtemp(prefix="modal-vc-proof-")
roots = {name: os.path.join(sandbox, name) for name in ("tmp", "weights", "cwd", "home")}
for p in roots.values():
    os.makedirs(p)
capture_dir = os.path.join(sandbox, "capture")  # not snapshotted: the harness's own files
os.makedirs(capture_dir)
os.environ["TMPDIR"] = roots["tmp"]
os.environ["HOME"] = roots["home"]
tempfile.tempdir = roots["tmp"]
MODULE_ARG = os.path.abspath(sys.argv[1])
os.chdir(roots["cwd"])

module_path = MODULE_ARG
spec = importlib.util.spec_from_file_location("chatterbox_vc_under_test", module_path)
vc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vc)
if hasattr(vc, "WEIGHTS"):
    vc.WEIGHTS = roots["weights"]


def snapshot():
    files = {}
    for name, root in roots.items():
        for d, dirs, fs in os.walk(root):
            for x in dirs + fs:
                p = os.path.join(d, x)
                st = os.lstat(p)
                files[p] = (st.st_size, st.st_mtime_ns)
    return files


# --- The input: random bytes with a marker, so any copy of it is findable. -------------------------------------------
MARKER = "SNOWMOON" + "-RECORDING-" + "MARKER"


def make_input(seed, marked=True):
    body = hashlib.sha512(seed.encode()).digest() * 64  # 4 KiB, deterministic
    return body[:2000] + MARKER.encode() + body[2000:] if marked else body


def needles(data):
    b64 = base64.b64encode(data).decode()
    out = [MARKER, b64[:40], base64.urlsafe_b64encode(data).decode()[:40], data.hex()[:40], repr(data[:12])[2:-1]]
    out += [b64[i:i + 24] for i in range(0, len(b64) - 24, 64)]
    out += [data[i:i + 24].hex() for i in range(0, len(data) - 24, 512)]
    return out


def leaks(text, secrets, where):
    found = []
    allowed_hex = {hashlib.sha256(s).hexdigest() for s in secrets}
    for s in secrets:
        for n in needles(s):
            if n and n in text:
                found.append("%s contains the input (%s…)" % (where, n[:12]))
                break
    for run in re.findall(r"[0-9a-fA-F]{32,}", text):
        if run.lower() not in allowed_hex:
            found.append("%s contains a long hex run (%d chars) that is not the input's sha256" % (where, len(run)))
    if re.search(r"(\\x[0-9a-f]{2}){8,}", text):
        found.append("%s contains a bytes repr" % where)
    return found


@contextlib.contextmanager
def captured(label):
    """Everything written to fd 1 and 2, and to `logging`, while the block runs."""
    path = os.path.join(capture_dir, label.replace(" ", "_") + ".log")
    sys.stdout.flush()
    sys.stderr.flush()
    saved = os.dup(1), os.dup(2)
    log_buf = io.StringIO()
    handler = logging.StreamHandler(log_buf)
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    old_level = root_logger.level
    root_logger.setLevel(logging.DEBUG)
    box = {}
    with open(path, "w+") as f:
        os.dup2(f.fileno(), 1)
        os.dup2(f.fileno(), 2)
        try:
            yield box
        finally:
            sys.stdout.flush()
            sys.stderr.flush()
            os.dup2(saved[0], 1)
            os.dup2(saved[1], 2)
            os.close(saved[0])
            os.close(saved[1])
            root_logger.removeHandler(handler)
            root_logger.setLevel(old_level)
            f.seek(0)
            box["text"] = f.read() + log_buf.getvalue()


# --- Stub engines. -------------------------------------------------------------------------------------------------------
def fake_wav(seconds=0.5, rate=24000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return buf.getvalue()


class Engine:
    """Reads both files like the model does, and leaves litter for the cleanup to catch."""

    def __init__(self, behaviour, expect):
        self.behaviour, self.expect, self.calls = behaviour, expect, 0

    def convert(self, source_path, target_path):
        self.calls += 1
        with open(source_path, "rb") as f:
            seen = f.read()
        if hashlib.sha256(seen).hexdigest() != self.expect:
            raise AssertionError("the engine did not get the recording")
        fd, _ = tempfile.mkstemp(suffix=".wav")  # a library's temp file, which must go with the per-call folder
        os.write(fd, seen)
        os.close(fd)
        with open(os.path.join(os.path.dirname(source_path), "cache.bin"), "wb") as f:
            f.write(seen)
        if self.behaviour == "raise":
            raise RuntimeError("could not decode " + base64.b64encode(seen).decode())
        if self.behaviour == "timeout":
            raise TimeoutError("took too long: " + seen.hex())
        if self.behaviour == "cancel":
            raise KeyboardInterrupt()  # what a cancelled input or a stopping container raises: a BaseException
        return fake_wav()


# --- Scenarios. ----------------------------------------------------------------------------------------------------------
def body_for(source, target, source_ext="webm", target_ext="wav"):
    return json.dumps({"source_b64": base64.b64encode(source).decode(), "target_b64": base64.b64encode(target).decode(), "source_ext": source_ext, "target_ext": target_ext}).encode()


def post(port, data):
    req = urllib.request.Request("http://127.0.0.1:%d/" % port, data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def scenario(label, run, expect_gone=()):
    before = snapshot()
    with captured(label) as box:
        try:
            result = run()
        except BaseException as e:  # noqa: B036 — the cancel scenario raises KeyboardInterrupt on purpose
            result = {"raised": type(e).__name__}
    after = snapshot()
    new = sorted(set(after) - set(before))
    changed = sorted(p for p in set(after) & set(before) if after[p] != before[p])
    kept = sorted(p for p in expect_gone if p in after)
    for p in new:
        problems.append("%s: left %s" % (label, os.path.relpath(p, sandbox)))
    for p in changed:
        problems.append("%s: changed %s" % (label, os.path.relpath(p, sandbox)))
    for p in kept:
        problems.append("%s: did not remove %s" % (label, os.path.relpath(p, sandbox)))
    secrets = result.pop("secrets", [])
    problems.extend("%s: %s" % (label, x) for x in leaks(box["text"], secrets, "the logs"))
    for k in [k for k in result if k.startswith("reply")]:
        problems.extend("%s: %s" % (label, x) for x in leaks(result[k], secrets, "the reply"))
        result[k] = "%d chars" % len(result[k])
    result.setdefault("log_lines", len([x for x in box["text"].splitlines() if x.strip()]))
    scenarios.append(dict(label=label, **result))
    return result


def main():
    if server_config.get("_not_a_server") or server_config.get("_web_function"):
        problems.append("the endpoint is not a Modal Server (Web Function and Function inputs are kept by Modal up to 7 days)")
    if server_config.get("unauthenticated"):
        problems.append("the server accepts unauthenticated requests")
    if server_config.get("max_concurrency") != 1:
        problems.append("max_concurrency is not 1: two calls could share a container's folder")
    for k in ("volumes", "network_file_systems"):
        if server_config.get(k):
            problems.append("the server mounts %s" % k)

    # The character's clip is public and held by the harness throughout, so it carries no marker; the logs and
    # replies are still checked for it.
    target = make_input("character reference clip", marked=False)
    httpd = vc.make_server(None, "127.0.0.1", 0)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    def http_case(behaviour, want_status, seed, data_fn=None):
        def run():
            source = make_input(seed)
            httpd.engine = Engine(behaviour, hashlib.sha256(source).hexdigest())
            data = data_fn(source) if data_fn else body_for(source, target)
            status, reply = post(port, data)
            r = {"status": status, "secrets": [source, target], "reply_body": reply.decode("latin-1")}
            if status != want_status:
                problems.append("%s: HTTP %d, expected %d" % (behaviour, status, want_status))
            if want_status == 200 and reply[:4] != b"RIFF":
                problems.append("success: the reply is not the converted WAV")
            if want_status == 200 and reply != fake_wav():
                problems.append("success: the reply is not only the converted audio")
            return r
        return run

    scenario("converts", http_case("ok", 200, "a"))
    scenario("model raises an error quoting the input", http_case("raise", 500, "b"))
    scenario("model times out", http_case("timeout", 500, "c"))
    scenario("not base64", http_case("ok", 400, "d", lambda s: b'{"source_b64": "' + s[:200].hex().encode() + b'!!", "target_b64": "AA=="}'))
    scenario("not JSON, the raw recording", http_case("ok", 400, "e", lambda s: s))
    scenario("unknown format", http_case("ok", 400, "f", lambda s: body_for(s, target, source_ext="exe")))
    scenario("too large", http_case("ok", 413, "g", lambda s: body_for(s * 300, target)))

    def cancelled():
        source = make_input("h")
        try:
            vc.convert_recording(Engine("cancel", hashlib.sha256(source).hexdigest()), source, target, "webm", "wav")
            problems.append("cancel: no exception reached the caller")
        except KeyboardInterrupt:
            pass
        return {"secrets": [source, target]}
    scenario("cancelled mid-call (BaseException)", cancelled)

    # A container killed mid-call never reaches `finally`; its folder must go at the next call and at exit.
    def plant_leftover():
        d = os.path.join(roots["tmp"], vc.WORK_PREFIX + "killed")
        os.makedirs(d)
        with open(os.path.join(d, "in.webm"), "wb") as f:
            f.write(make_input("killed"))
        return d
    left = plant_leftover()
    scenario("leftover of a killed call, then the next call", http_case("ok", 200, "i"), expect_gone=[left])
    left = plant_leftover()

    def stop():
        obj = vc.VoiceConversion.__new__(vc.VoiceConversion)
        if hasattr(obj, "stop"):
            obj.stop()
        else:
            problems.append("no @modal.exit sweep")
        return {"secrets": [make_input("killed")]}
    scenario("leftover of a killed call, then the container stops", stop, expect_gone=[left])

    httpd.shutdown()
    httpd.server_close()

    # Nothing keeps the input: no reachable Python object holds the marker.
    httpd.engine = None
    gc.collect()
    marker = MARKER.encode()
    holders = set()
    for o in gc.get_objects():
        for r in gc.get_referents(o):
            if isinstance(r, (bytes, bytearray)) and r is not marker and marker in r:
                holders.add(type(o).__name__)
            elif isinstance(r, str) and r is not MARKER and MARKER in r:
                holders.add(type(o).__name__)
    # The harness itself builds inputs from a seed and holds none between scenarios.
    for h in sorted(holders):
        problems.append("after the calls, a %s still holds the recording" % h)

    for u in storage_use:
        problems.append("uses Modal storage: %s" % u)


try:
    main()
finally:
    os.chdir("/")
    shutil.rmtree(sandbox, ignore_errors=True)
print(json.dumps({"problems": problems, "scenarios": scenarios}))
sys.exit(1 if problems else 0)
