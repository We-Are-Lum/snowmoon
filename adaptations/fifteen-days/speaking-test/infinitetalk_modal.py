"""
InfiniteTalk (MeiGen-AI, Apache-2.0) on Modal, for the speaking-shot test (owner, 2026-10-19).

The weights go to a Modal volume from a CPU-only function, so no GPU is billed while they download. Then one GPU run
per shot: the published frame and its trimmed finished line (recipe.json), nothing else. Every revision is pinned.

  modal run infinitetalk_modal.py::download          # CPU: weights to the volume (once)
  modal run infinitetalk_modal.py::speak --shot 2-zei-b2-9
"""
import json
import os
import subprocess
import time
from pathlib import Path

import modal

HERE = Path(__file__).parent
# Pinned revisions (Hugging Face commit shas, GitHub commit), checked 2026-10-19.
WAN = ("Wan-AI/Wan2.1-I2V-14B-480P", "6b73f84e66371cdfe870c72acd6826e1d61cf279")  # Apache-2.0
WAV2VEC = ("TencentGameMate/chinese-wav2vec2-base", "3991242c806928916fff4a8c0e4f76acf661b743")  # MIT
WAV2VEC_SAFETENSORS = "5f7a6cfdfc5440ec78748f79a9dd66f077c2b463"  # refs/pr/1, as InfiniteTalk's README asks
INFINITETALK = ("MeiGen-AI/InfiniteTalk", "d59847ebdacf19245bfca3fb23311c0cada8378a")  # Apache-2.0
CODE = ("https://github.com/MeiGen-AI/InfiniteTalk", "50aa0a94184315407a991ae804d9b58d6d311ba8")

GPU = "H100"
# Modal's list price for an H100, per second (verify on the bill; the run records seconds, so the cost can be redone).
GPU_USD_PER_S = 0.001097

app = modal.App("snowmoon-speaking-test")
weights = modal.Volume.from_name("infinitetalk-weights", create_if_missing=True)
W = "/weights"

dl_image = modal.Image.debian_slim(python_version="3.10").pip_install("huggingface_hub[hf_transfer]==0.26.2").env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})

gpu_image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.4.1", "torchvision==0.19.1", "torchaudio==2.4.1", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("xformers==0.0.28", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install(
        "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/"
        "flash_attn-2.7.4.post1+cu12torch2.4cxx11abiFALSE-cp310-cp310-linux_x86_64.whl"
    )
    .run_commands(f"git clone {CODE[0]} /code && cd /code && git checkout {CODE[1]}")
    .pip_install("misaki[en]", "ninja", "psutil", "packaging", "wheel", "librosa")
    .run_commands("cd /code && pip install -r requirements.txt")
)


@app.function(image=dl_image, volumes={W: weights}, cpu=4, memory=8192, timeout=3 * 3600)
def download():
    """CPU only: the three model repos at their pinned revisions, into the volume."""
    from huggingface_hub import hf_hub_download, snapshot_download

    snapshot_download(WAN[0], revision=WAN[1], local_dir=f"{W}/Wan2.1-I2V-14B-480P", allow_patterns=["*.json", "*.safetensors", "*.pth", "google/*", "xlm-roberta-large/*"])
    snapshot_download(WAV2VEC[0], revision=WAV2VEC[1], local_dir=f"{W}/chinese-wav2vec2-base", allow_patterns=["*.json", "*.txt"])
    hf_hub_download(WAV2VEC[0], "model.safetensors", revision=WAV2VEC_SAFETENSORS, local_dir=f"{W}/chinese-wav2vec2-base")
    snapshot_download(INFINITETALK[0], revision=INFINITETALK[1], local_dir=f"{W}/InfiniteTalk", allow_patterns=["single/infinitetalk.safetensors", "README.md"])
    weights.commit()
    sizes = {p: sum(f.stat().st_size for f in Path(f"{W}/{p}").rglob("*") if f.is_file()) for p in ("Wan2.1-I2V-14B-480P", "chinese-wav2vec2-base", "InfiniteTalk")}
    print(json.dumps({k: f"{v / 1e9:.1f} GB" for k, v in sizes.items()}))


@app.function(image=gpu_image, volumes={W: weights}, gpu=GPU, timeout=30 * 60)
def generate(frame: bytes, audio: bytes, prompt: str, steps: int, seed: int) -> dict:
    """One GPU run: the frame and its line, InfiniteTalk 480p, single person, image to video."""
    t0 = time.time()
    work = Path("/tmp/job")
    work.mkdir(exist_ok=True)
    (work / "frame.png").write_bytes(frame)
    (work / "line.wav").write_bytes(audio)
    (work / "input.json").write_text(json.dumps({"prompt": prompt, "cond_video": str(work / "frame.png"), "cond_audio": {"person1": str(work / "line.wav")}}))
    cmd = [
        "python", "generate_infinitetalk.py",
        "--ckpt_dir", f"{W}/Wan2.1-I2V-14B-480P",
        "--wav2vec_dir", f"{W}/chinese-wav2vec2-base",
        "--infinitetalk_dir", f"{W}/InfiniteTalk/single/infinitetalk.safetensors",
        "--input_json", str(work / "input.json"),
        "--size", "infinitetalk-480",
        "--sample_steps", str(steps),
        "--mode", "streaming",
        "--motion_frame", "9",
        "--base_seed", str(seed),
        "--save_file", str(work / "out"),
    ]
    run = subprocess.run(cmd, cwd="/code", capture_output=True, text=True)
    seconds = time.time() - t0
    out = work / "out.mp4"
    return {
        "ok": run.returncode == 0 and out.exists(),
        "video": out.read_bytes() if out.exists() else b"",
        "gpu": GPU,
        "seconds": round(seconds, 1),
        "est_usd": round(seconds * GPU_USD_PER_S, 3),
        "command": cmd,
        "log_tail": (run.stdout + run.stderr)[-4000:],
    }


@app.local_entrypoint()
def speak(shot: str, steps: int = 40, seed: int = 42):
    recipe = json.loads((HERE / "recipe.json").read_text())
    s = next(x for x in recipe["shots"] if x["id"] == shot)
    prompt = PROMPTS[shot]
    res = generate.remote((HERE / f"{shot}.png").read_bytes(), (HERE / f"{shot}-trimmed.wav").read_bytes(), prompt, steps, seed)
    out_dir = HERE / "infinitetalk"
    out_dir.mkdir(exist_ok=True)
    if res["ok"]:
        (out_dir / f"{shot}.mp4").write_bytes(res["video"])
    run = {
        "shot": shot, "ok": res["ok"], "model": INFINITETALK, "base": WAN, "audio_encoder": [WAV2VEC, WAV2VEC_SAFETENSORS], "code": CODE,
        "frame_sha256": s["frame"]["sha256"], "audio_sha256": s["audio"]["sha256"], "prompt": prompt, "prompt_by": "coding agent (drafted)",
        "settings": {"size": "infinitetalk-480", "steps": steps, "mode": "streaming", "motion_frame": 9, "seed": seed},
        "gpu": res["gpu"], "seconds": res["seconds"], "est_usd": res["est_usd"], "command": res["command"],
    }
    (out_dir / f"{shot}.run.json").write_text(json.dumps(run, indent=1) + "\n")
    print(json.dumps({k: run[k] for k in ("shot", "ok", "gpu", "seconds", "est_usd")}))
    if not res["ok"]:
        print(res["log_tail"])


# What each shot shows, for InfiniteTalk's text condition. Drafted by the coding agent from the frames; plain, no new action.
PROMPTS = {
    "1-bai-b1-6": "A hand-drawn comic-style close-up of a young woman with a pink undercut ponytail and a lime vest, leaning on a railing above a game hall, speaking with a dry, unimpressed expression. Subtle natural head and shoulder movement.",
    "2-zei-b2-9": "A hand-drawn comic-style close-up of a young man with spiky black hair with a blue streak and an orange jacket in a dim corridor, speaking with a teasing closed-mouth smile between words. Subtle natural head movement.",
    "3-deluin-b4-3": "A hand-drawn comic-style close-up of a young man with wavy light brown hair in a cream cable-knit sweater, seated at a cafe terrace at night, speaking warmly and easily. Subtle natural head movement.",
}
