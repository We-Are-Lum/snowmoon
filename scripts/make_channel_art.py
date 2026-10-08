"""Draws the /snowmoon channel avatar and banner in code.

No image model is used. Colours and typefaces come from the app's design
boards: board black #0E0F13, paper #F4F2ED, Dzego cyan #46D7E8,
Crimson Pro for the name and DM Mono for labels (both SIL Open Font License).

Needs Python Playwright with its Chromium (in the narration venv:
uv pip install --python .venv playwright; .venv/bin/python -m playwright install chromium)
and the two @fontsource packages, @fontsource/crimson-pro and @fontsource/dm-mono,
which `npm install` puts in node_modules/ at the repo root.

Run:  .venv/bin/python scripts/make_channel_art.py
Writes art-out/ (not committed); the podcast cover is copied to
content/snowmoon/podcast/cover.png with a recipe in content/snowmoon/recipes/podcast/cover.json.
Owner-supplied (FID 6786, 2026-10-08); in the repo, only the paths changed.
"""
import asyncio
import base64
import pathlib
import random

HERE = pathlib.Path(__file__).resolve().parent.parent  # the repo root, where node_modules/ is
OUT = HERE / "art-out"
BOARD = "#0E0F13"
GRID = "#191A20"
PAPER = "#F4F2ED"
DIM = "#8B8A92"
FAINT = "#4B4C55"
CYAN = "#46D7E8"


def font_face(family, weight, path):
    data = base64.b64encode((HERE / path).read_bytes()).decode()
    return (
        f"@font-face{{font-family:'{family}';font-weight:{weight};"
        f"src:url(data:font/woff2;base64,{data}) format('woff2');}}"
    )


FONTS = "".join(
    [
        font_face("Crimson Pro", 500, "node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-500-normal.woff2"),
        font_face("DM Mono", 400, "node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2"),
    ]
)


def crescent(cx, cy, r, dx, dy, r2):
    """Cells inside the moon's disc and outside the shadow's disc."""
    cells = set()
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            in_moon = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
            in_shadow = (x - cx - dx) ** 2 + (y - cy - dy) ** 2 <= r2 * r2
            if in_moon and not in_shadow:
                cells.add((x, y))
    return cells


def rect(x, y, size, gap, colour, opacity=1.0):
    r = size * 0.14
    return (
        f'<rect x="{x * size + gap:.1f}" y="{y * size + gap:.1f}" '
        f'width="{size - 2 * gap:.1f}" height="{size - 2 * gap:.1f}" rx="{r:.1f}" '
        f'fill="{colour}" opacity="{opacity}"/>'
    )


def grid_lines(cols, rows, size):
    out = []
    for c in range(cols + 1):
        out.append(f'<line x1="{c * size}" y1="0" x2="{c * size}" y2="{rows * size}" stroke="{GRID}" stroke-width="1"/>')
    for r in range(rows + 1):
        out.append(f'<line x1="0" y1="{r * size}" x2="{cols * size}" y2="{r * size}" stroke="{GRID}" stroke-width="1"/>')
    return "".join(out)


def snow(rng, cols, rows, count, blocked):
    """Scattered single cells, never touching each other or a blocked cell."""
    placed = set()
    tries = 0
    while len(placed) < count and tries < 5000:
        tries += 1
        x, y = rng.randrange(cols), rng.randrange(rows)
        near = {(x + i, y + j) for i in (-1, 0, 1) for j in (-1, 0, 1)}
        if near & blocked or near & placed:
            continue
        placed.add((x, y))
    return placed


def avatar_svg():
    size, cols, rows = 64, 16, 16  # 1024 x 1024
    moon = crescent(7.5, 7.5, 4.6, 2.3, -1.2, 4.1)
    rng = random.Random(3724)
    blocked = {(x + i, y + j) for (x, y) in moon for i in range(-1, 2) for j in range(-1, 2)}
    # keep snow inside the circle a round crop would leave
    outside = {(x, y) for x in range(cols) for y in range(rows) if (x - 7.5) ** 2 + (y - 7.5) ** 2 > 6.6 ** 2}
    flakes = snow(rng, cols, rows, 7, blocked | outside)
    parts = [f'<rect width="1024" height="1024" fill="{BOARD}"/>', grid_lines(cols, rows, size)]
    parts += [rect(x, y, size, 4, PAPER) for (x, y) in sorted(moon)]
    for i, (x, y) in enumerate(sorted(flakes)):
        parts.append(rect(x, y, size, 4, CYAN if i == 2 else DIM, 1.0 if i == 2 else 0.9))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{"".join(parts)}</svg>'


def banner_svg():
    size, cols, rows = 25, 60, 20  # 1500 x 500
    moon = crescent(13.5, 8.5, 5.6, 2.8, -1.4, 5.0)
    wall_y = 17
    door_x = 13
    wall = {(x, wall_y) for x in range(cols) if x != door_x}
    text_box = {(x, y) for x in range(21, 49) for y in range(4, 14)}
    blocked = (
        {(x + i, y + j) for (x, y) in moon for i in range(-1, 2) for j in range(-1, 2)}
        | {(x, y) for x in range(cols) for y in range(wall_y - 1, rows)}
        | text_box
    )
    rng = random.Random(3724)
    flakes = snow(rng, cols, rows, 26, blocked)
    parts = [f'<rect width="1500" height="500" fill="{BOARD}"/>', grid_lines(cols, rows, size)]
    parts += [rect(x, y, size, 2, FAINT) for (x, y) in sorted(wall)]
    parts += [rect(x, y, size, 2, PAPER) for (x, y) in sorted(moon)]
    for i, (x, y) in enumerate(sorted(flakes)):
        parts.append(rect(x, y, size, 2, CYAN if i % 9 == 4 else DIM, 1.0 if i % 9 == 4 else 0.85))
    parts.append(
        f'<text x="560" y="266" font-family="Crimson Pro" font-weight="500" font-size="104" '
        f'fill="{PAPER}" letter-spacing="-1">Snowmoon Party</text>'
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500">{"".join(parts)}</svg>'


def podcast_cover_svg():
    """3000 x 3000 podcast cover: the moon, the name, the wall with its door."""
    size, cols, rows = 125, 24, 24
    moon = crescent(11.5, 8.0, 5.6, 2.8, -1.4, 5.0)
    wall_y = 21
    door_x = 11
    wall = {(x, wall_y) for x in range(cols) if x != door_x}
    text_box = {(x, y) for x in range(1, 23) for y in range(15, 20)}
    blocked = (
        {(x + i, y + j) for (x, y) in moon for i in range(-1, 2) for j in range(-1, 2)}
        | {(x, y) for x in range(cols) for y in range(wall_y - 1, rows)}
        | text_box
    )
    rng = random.Random(3724)
    flakes = snow(rng, cols, rows, 16, blocked)
    parts = [f'<rect width="3000" height="3000" fill="{BOARD}"/>', grid_lines(cols, rows, size)]
    parts += [rect(x, y, size, 8, FAINT) for (x, y) in sorted(wall)]
    parts += [rect(x, y, size, 8, PAPER) for (x, y) in sorted(moon)]
    for i, (x, y) in enumerate(sorted(flakes)):
        parts.append(rect(x, y, size, 8, CYAN if i % 7 == 3 else DIM, 1.0 if i % 7 == 3 else 0.85))
    parts.append(
        f'<text x="1500" y="2300" text-anchor="middle" font-family="Crimson Pro" font-weight="500" '
        f'font-size="372" fill="{PAPER}" letter-spacing="-4">Snowmoon Party</text>'
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000" viewBox="0 0 3000 3000">{"".join(parts)}</svg>'


async def render(svg, width, height, out):
    from playwright.async_api import async_playwright

    html = f"<html><head><style>{FONTS}html,body{{margin:0;background:{BOARD}}}svg{{display:block}}</style></head><body>{svg}</body></html>"
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        await page.set_content(html)
        await page.evaluate("document.fonts.ready")
        await page.screenshot(path=str(out), clip={"x": 0, "y": 0, "width": width, "height": height})
        await browser.close()


async def main():
    OUT.mkdir(exist_ok=True)
    await render(avatar_svg(), 1024, 1024, OUT / "snowmoon-channel-avatar.png")
    await render(banner_svg(), 1500, 500, OUT / "snowmoon-channel-banner.png")
    await render(podcast_cover_svg(), 3000, 3000, OUT / "snowmoon-podcast-cover.png")


if __name__ == "__main__":
    asyncio.run(main())
