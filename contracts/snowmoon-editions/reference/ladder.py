#!/usr/bin/env python3
"""Reference price tables for LadderSeller, computed off-chain at 80 significant digits.

price(n) = start * (top / start) ** ((n - 1) / (N - 1)), n = 1..N, rounded down to 1e12 wei,
kept within [start, top]; piece 1 is exactly start, piece N exactly top, and N = 1 gives start.

Writes test/reference/<name>.json: {"start", "top", "size", "prices": [...], "near": [...]}.
`near` lists piece numbers whose exact value is within 1e-14 (relative) of a 1e12-wei step boundary without
being on it, where the on-chain computation (18 digits, with a 1e-15 allowance before rounding down) may land
one step higher. Values exactly on a step are not "near": they must match.
Standard library only (decimal). Run: python3 -I reference/ladder.py
"""
import json
import os
import sys
from decimal import Decimal, getcontext, ROUND_FLOOR

getcontext().prec = 80
STEP = 10**12
ETH = 10**18

def ladder(start, top, size):
    prices, near = [], []
    ratio = Decimal(top) / Decimal(start)
    for n in range(1, size + 1):
        if n == 1 or start == top:
            prices.append(start); continue
        if n == size:
            prices.append(top); continue
        exact = Decimal(start) * (ratio.ln() * Decimal(n - 1) / Decimal(size - 1)).exp()
        # 80-digit maths puts a value that is exactly on a step (0.005 ETH) a hair below it; 1e-40 puts it back.
        floored = int((exact * (1 + Decimal("1e-40"))).to_integral_value(rounding=ROUND_FLOOR))
        p = floored - floored % STEP
        # distance from the exact value to the nearest step boundary, relative to the price
        frac = exact / STEP - (exact / STEP).to_integral_value(rounding=ROUND_FLOOR)
        dist = min(frac, 1 - frac) * STEP / exact
        if Decimal("1e-40") < dist < Decimal("1e-14"):
            near.append(n)
        p = max(start, min(top, p))
        prices.append(p)
    return prices, near

CASES = {
    # the first ladder: 0.0005 ETH to 0.5 ETH
    "first_256": (5 * 10**14, 5 * 10**17, 256),
    "first_100": (5 * 10**14, 5 * 10**17, 100),
    "first_2": (5 * 10**14, 5 * 10**17, 2),
    "first_1": (5 * 10**14, 5 * 10**17, 1),
    # other start and top prices
    "small_256": (10**13, 10**16, 256),          # 0.00001 -> 0.01 ETH
    "flat_256": (10**15, 10**15, 256),           # start == top
    "steep_256": (10**12, 10 * ETH, 256),        # 0.000001 -> 10 ETH
    "gentle_256": (10**17, 10**17 + 10**15, 256),# 0.1 -> 0.101 ETH (many equal steps)
    "odd_100": (123456789012345, 987654321098765432, 100),  # endpoints not on the step
    "tiny_start_100": (1, 10**16, 100),          # start below one step
    "third_3": (3 * 10**14, 7 * 10**17, 3),
    "big_256": (ETH, 1000 * ETH, 256),
    "max_256": (ETH, 10**24, 256),               # up to MAX_PRICE (1,000,000 ETH)
    "widest_256": (1, 10**24, 256),              # 1 wei to MAX_PRICE
}

def random_cases(count=60, seed=20261118):
    """Random ladders: size 1..256, start log-uniform over 1e12..1e18 wei (some off the step), top/start up to 1e6."""
    import random
    rng = random.Random(seed)
    cases = []
    for i in range(count):
        size = rng.choice([1, 2, 3, rng.randint(4, 256), 256])
        start = int(10 ** rng.uniform(12, 18))
        if rng.random() < 0.5:
            start -= start % STEP or 0
            start = max(start, STEP)
        top = start if rng.random() < 0.05 else int(start * 10 ** rng.uniform(0, 6))
        cases.append((f"random_{i:02d}", start, top, size))
    return cases

def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", "reference")
    os.makedirs(out, exist_ok=True)
    for name, (start, top, size) in CASES.items():
        prices, near = ladder(start, top, size)
        assert prices[0] == start and prices[-1] == (top if size > 1 else start)
        assert all(a <= b for a, b in zip(prices, prices[1:]))
        # JSON numbers above 2^53 lose precision in some readers; write them as decimal strings.
        doc = {"start": str(start), "top": str(top), "size": size,
               "prices": [str(p) for p in prices], "near": near}
        with open(os.path.join(out, name + ".json"), "w") as f:
            json.dump(doc, f, indent=1)
        print(f"{name}: {size} prices, {len(near)} near a step boundary", file=sys.stderr)
    docs = []
    for name, start, top, size in random_cases():
        prices, near = ladder(start, top, size)
        docs.append({"start": str(start), "top": str(top), "size": size,
                     "prices": [str(p) for p in prices], "near": near})
    with open(os.path.join(out, "random.json"), "w") as f:
        json.dump({"cases": docs}, f)
    print(f"random: {len(docs)} ladders, {sum(len(d['prices']) for d in docs)} prices, "
          f"{sum(len(d['near']) for d in docs)} near a step boundary", file=sys.stderr)

if __name__ == "__main__":
    main()
