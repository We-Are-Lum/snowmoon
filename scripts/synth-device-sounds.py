"""Synthesize an adaptation's device sounds in code: no model, no download, just numbers (owner, 2026-10-16).

  .venv-voice/bin/python scripts/synth-device-sounds.py fifteen-days

One family of sounds for every Dzego device, so they read as one world: soft sine-and-bell tones tuned to a
just scale built on 11/8 and 7/4 (intervals a piano can't play, so the chimes sound gentle but not of the
Earth we know), slow attacks, a short airy shimmer, and a small synthetic room. The sounds: the message
sent and received (the reply at the vigil matters most, so it has three versions to choose from), the menu
appearing and the menu tablet's taps, and the robot waiter's beeps and its glide. Every sound is written to
scenes-out/<seed>/sfx/device-<name>.wav (48 kHz, 24-bit), and its recipe (this script's sha256, the
settings, the output's sha256) to adaptations/<seed>/sounds/recipe.json, source kind "synthesized in code".
They peak at -18 dBFS, quiet by design: the owner's note on 2026-10-16 was that they would stick out.
The same settings always give the same file: the only randomness is numpy's generator with a fixed seed.
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
BASE = 392.0  # the family's root, a little under G4
# The scale: just ratios with the 7th and 11th harmonics (1, 9/8, 5/4, 11/8, 3/2, 7/4, 2).
R = {"1": 1.0, "9/8": 9 / 8, "5/4": 5 / 4, "11/8": 11 / 8, "3/2": 3 / 2, "7/4": 7 / 4, "2": 2.0, "11/4": 11 / 4, "3": 3.0}


def t(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def env(n: int, attack: float, decay: float) -> np.ndarray:
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1) ** 2
    return a * np.exp(-np.maximum(x - attack, 0) / decay)


def bell(freq: float, dur: float, attack=0.012, decay=0.35, bright=0.35) -> np.ndarray:
    """A soft bell: a sine, an inharmonic partial at 2.76x (a struck bar), and a faint shimmer a few cents off."""
    x = t(dur)
    s = np.sin(2 * np.pi * freq * x)
    s += bright * np.sin(2 * np.pi * freq * 2.76 * x) * np.exp(-x / (decay * 0.35))
    s += 0.25 * np.sin(2 * np.pi * freq * 1.003 * x + 0.7)
    return s * env(len(x), attack, decay)


def glide(f0: float, f1: float, dur: float, attack=0.03, decay=0.25) -> np.ndarray:
    x = t(dur)
    f = f0 * (f1 / f0) ** (x / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), attack, decay)


def air(dur: float, lo: float, hi: float, rng, attack=0.05, decay=0.2) -> np.ndarray:
    sos = butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, rng.standard_normal(int(dur * SR))) * env(int(dur * SR), attack, decay)


def place(total: float, *parts) -> np.ndarray:
    out = np.zeros(int(total * SR))
    for at, sig, gain in parts:
        i = int(at * SR)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += gain * sig[:n]
    return out


def room(x: np.ndarray, rng, wet=0.18, decay=0.6) -> np.ndarray:
    """A small synthetic room: the sound convolved with a short burst of decaying, darkened noise."""
    n = int(decay * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (decay / 5))
    ir = sosfilt(butter(1, 5000, fs=SR, output="sos"), ir)
    ir /= np.sqrt(np.sum(ir ** 2))
    tail = np.convolve(x, ir)
    y = np.concatenate([x, np.zeros(len(tail) - len(x))])
    return (1 - wet) * y + wet * tail


def finish(x: np.ndarray, rng, wet=0.18, peak_db=-18.0) -> np.ndarray:
    y = room(x, rng, wet)
    fade = int(0.01 * SR)
    y[-fade:] *= np.linspace(1, 0, fade)
    y /= np.max(np.abs(y)) + 1e-9
    y *= 10 ** (peak_db / 20)
    return np.stack([y, y], axis=1)


def sounds(rng) -> dict:
    f = lambda r, o=1.0: BASE * R[r] * o
    out = {}
    # The reply at the vigil: three versions, each three notes rising and resolving, slow and kind.
    out["message-received-a"] = ("the reply arrives (vigil): three soft rising bells, 1 - 11/8 - 7/4", place(
        2.2, (0.0, bell(f("1", 2), 1.6, decay=0.5), 0.8), (0.16, bell(f("11/8", 2), 1.6, decay=0.5), 0.7),
        (0.32, bell(f("7/4", 2), 1.9, decay=0.7), 0.75)))
    out["message-received-b"] = ("the reply arrives (vigil): two bells a 7/4 apart over a low warm pad", place(
        2.4, (0.0, glide(f("1"), f("1"), 2.2, attack=0.25, decay=0.9) * 0.6, 0.5), (0.05, bell(f("3/2", 2), 1.8, decay=0.6), 0.7),
        (0.30, bell(f("11/4", 2) / 1.0, 2.0, decay=0.8, bright=0.2), 0.6)))
    out["message-received-c"] = ("the reply arrives (vigil): a single slow bloom, three notes struck together and swelling", place(
        2.6, *[(0.0, bell(f(r, 2), 2.4, attack=0.12, decay=0.9, bright=0.15), g) for r, g in (("1", 0.6), ("11/8", 0.45), ("7/4", 0.4))]))
    out["message-sent"] = ("a message sent (Zei's fifth message; Deluin at the gate): an airy upward glide and a small bell",
                           place(1.0, (0.0, air(0.45, 1500, 6000, rng, attack=0.08, decay=0.12), 0.25),
                                 (0.0, glide(f("1", 2), f("3/2", 2), 0.35, attack=0.04, decay=0.12), 0.5),
                                 (0.30, bell(f("7/4", 2), 0.7, decay=0.25), 0.55)))
    out["menu-appears"] = ("the menu appears on the paper-thin tablet: a soft bloom of air and two bells",
                           place(1.3, (0.0, air(1.0, 800, 4000, rng, attack=0.25, decay=0.3), 0.2),
                                 (0.10, bell(f("5/4", 2), 1.0, attack=0.06, decay=0.35, bright=0.15), 0.5),
                                 (0.18, bell(f("11/4"), 1.0, attack=0.06, decay=0.35, bright=0.15), 0.4)))
    for i, r in enumerate(("1", "9/8", "11/8"), 1):
        out[f"menu-tap-{i}"] = ("a finger tap on the menu tablet: a tiny soft tick with a pitched glint",
                                place(0.25, (0.0, air(0.03, 2000, 9000, rng, attack=0.001, decay=0.008), 0.6),
                                      (0.0, bell(f(r, 4), 0.2, attack=0.002, decay=0.04, bright=0.1), 0.35)))
    out["robot-greet"] = ("the robot's greeting before it speaks: a friendly rising two-note chirp",
                          place(0.7, (0.0, glide(f("1", 2), f("5/4", 2), 0.14, attack=0.01, decay=0.08), 0.6),
                                (0.16, glide(f("3/2", 2), f("7/4", 2), 0.22, attack=0.01, decay=0.12), 0.6)))
    out["robot-acknowledge"] = ("the robot acknowledges: a soft falling two-note chirp",
                                place(0.6, (0.0, glide(f("7/4", 2), f("3/2", 2), 0.14, attack=0.01, decay=0.08), 0.6),
                                      (0.15, glide(f("5/4", 2), f("1", 2), 0.2, attack=0.01, decay=0.1), 0.6)))
    # The robot's glide: a smooth low hum with a faint servo whir and a slow pitch drift as it moves.
    x = t(3.0)
    hum = np.sin(2 * np.pi * np.cumsum(f("1", 0.25) * (1 + 0.03 * np.sin(2 * np.pi * 0.4 * x))) / SR)
    whir = sosfilt(butter(2, [700, 1400], btype="band", fs=SR, output="sos"), rng.standard_normal(len(x))) * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * x))
    shape = np.clip(x / 0.6, 0, 1) * np.clip((3.0 - x) / 0.8, 0, 1)
    out["robot-glide"] = ("the robot glides up to the table: a smooth low hum and a faint whir, 3 s, fading in and out",
                          (0.7 * hum + 0.12 * whir) * shape)
    return out


def game_sounds(rng) -> dict:
    """The live Minpentai game heard from the overlook, and the corridor's elevator (owner's notes, 2026-10-17): synthesized
    blasts, fly-bys, crashes and wall hums, so the battle reads as electronic, never as a sports broadcast. Their own
    generator (seed 17102026), so adding them leaves every earlier device sound byte-identical."""
    f = lambda r, o=1.0: BASE * R[r] * o
    out = {}
    x = t(0.9)
    zap = np.sin(2 * np.pi * np.cumsum(f("2", 4) * np.exp(-x / 0.08) + 90) / SR) * env(len(x), 0.002, 0.18)
    out["game-blast"] = ("a hologram blast in the game below: a fast falling zap, a noise burst and a low thump", place(
        1.0, (0.0, zap, 0.6), (0.0, air(0.5, 300, 5000, rng, attack=0.002, decay=0.12), 0.7),
        (0.02, glide(110, 45, 0.6, attack=0.003, decay=0.15), 0.9)))
    out["game-flyby"] = ("a glider passing over the board: a filtered whoosh that rises and falls, with a doppler hum", place(
        2.0, (0.0, air(2.0, 400, 3000, rng, attack=0.9, decay=0.35), 0.8),
        (0.0, glide(f("1", 0.5), f("1", 0.35), 2.0, attack=0.9, decay=0.4), 0.35)))
    crash = air(1.6, 80, 2500, rng, attack=0.003, decay=0.45)
    debris = place(1.6, *[(0.05 + 0.09 * k + 0.03 * rng.random(), air(0.08, 1500, 8000, rng, attack=0.001, decay=0.02), 0.5 - 0.04 * k) for k in range(10)])
    out["game-crash"] = ("a glider breaking against a wall: a heavy noise crash, a sub drop and scattering glassy debris", place(
        1.8, (0.0, crash, 0.9), (0.0, glide(70, 35, 1.2, attack=0.002, decay=0.4), 1.0), (0.0, debris, 0.6)))
    x = t(2.5)
    hum = sum(np.sin(2 * np.pi * f(r, 0.5) * x * (1 + 0.002 * k)) for k, r in enumerate(("1", "3/2", "7/4")))
    out["game-wall"] = ("a holographic wall rising: a swelling three-note hum with a shimmer", place(
        2.6, (0.0, hum * env(len(x), 0.6, 0.9) / 3, 0.8), (0.3, air(2.0, 3000, 9000, rng, attack=0.5, decay=0.5), 0.25)))
    out["elevator-arrive"] = ("the corridor's elevator arriving: one soft two-tone chime and the doors' airy slide", place(
        2.2, (0.0, bell(f("3/2", 2), 1.2, decay=0.45, bright=0.2), 0.7), (0.32, bell(f("1", 2), 1.4, decay=0.55, bright=0.2), 0.7),
        (0.75, air(1.2, 200, 1800, rng, attack=0.25, decay=0.35), 0.35)))
    return out


def main() -> None:
    seed = sys.argv[1]
    rng = np.random.default_rng(16102026)
    dst = ROOT / "scenes-out" / seed / "sfx"
    dst.mkdir(parents=True, exist_ok=True)
    rec_p = ROOT / "adaptations" / seed / "sounds" / "recipe.json"
    rec = json.loads(rec_p.read_text())
    rec["about"] = ("Every sound effect used, with where it came from: a CC0 Freesound sound (source URL, licence, author), "
                    "the owner's own recording, or a device sound synthesized in code by scripts/synth-device-sounds.py "
                    "(owner, 2026-10-16). No AI-generated sound effects.")
    me = Path(__file__).read_bytes()
    rng2 = np.random.default_rng(17102026)
    made = [(n, w, x, rng) for n, (w, x) in sounds(rng).items()] + [(n, w, x, rng2) for n, (w, x) in game_sounds(rng2).items()]
    for name, what, x, g in made:
        y = finish(x, g, wet=0.12 if name.startswith(("menu-tap", "robot-glide")) else 0.3 if name.startswith("game") else 0.2,
                   peak_db=-12.0 if name.startswith("game") else -18.0)
        path = dst / f"device-{name}.wav"
        sf.write(path, y, SR, subtype="PCM_24")
        effect = f"game: {name[5:]}" if name.startswith("game-") else f"device: {name}"
        rec["sounds"] = [s for s in rec["sounds"] if s["effect"] != effect]
        rec["sounds"].append({"effect": effect, "what": what,
                              "source": {"kind": "synthesized in code", "script": "scripts/synth-device-sounds.py",
                                         "script_sha256": hashlib.sha256(me).hexdigest(), "rng_seed": 17102026 if g is rng2 else 16102026,
                                         "licence": "GPL-3.0, with the code that makes it"},
                              "file": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                              "duration_s": round(len(y) / SR, 2), "added_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        print(f"{effect}: {path.relative_to(ROOT)} ({len(y) / SR:.2f} s)")
    rec_p.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
