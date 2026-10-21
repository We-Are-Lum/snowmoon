"""Where the shared tools live, for any checkout: a plain clone (a fork) or a git worktree of the owner's checkout.

The Python environments (.venv-voice, .venv-image), node_modules and .voice-models sit in the main checkout; a worktree
shares them. MAIN is that checkout: the folder holding the git directory this checkout uses (for a plain clone, the clone
itself). Each tool can be pointed elsewhere with an environment variable. Raw takes are refused inside MAIN as well as
inside this checkout.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _main_checkout() -> Path:
    try:
        common = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        return (ROOT / common).resolve().parent
    except (OSError, subprocess.CalledProcessError):
        return ROOT


MAIN = _main_checkout()


def _python(env: str, venv: str) -> str:
    """The environment variable's Python, else the main checkout's venv, else the Python running this script."""
    p = os.environ.get(env) or str(MAIN / venv / "bin" / "python")
    return p if Path(p).exists() else sys.executable


VOICE_PY = _python("SNOWMOON_VOICE_PY", ".venv-voice")   # numpy, soundfile, torch (voice conversion, mixing)
IMAGE_PY = _python("SNOWMOON_IMAGE_PY", ".venv-image")   # pillow, requests (pictures)
VOICE_MODELS = Path(os.environ.get("SNOWMOON_VOICE_MODELS") or MAIN / ".voice-models")  # local model weights (never committed)
