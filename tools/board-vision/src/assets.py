"""Rasterize every piece style into .cache/pieces/<style>.npz (12 x SPRITE_PX x SPRITE_PX x 4 uint8, PIECE_CODES order).

Sources:
  ours-<set>[-vN]  our sprite sets (apps/web/public/pieces), default + random recolors
  lila-<set>       lichess-org/lila public/piece/<set>/*.svg (training only, not shipped)
  font-<name>-<m>  Unicode chess glyphs U+2654..265F from installed fonts, several ink modes
"""
from __future__ import annotations

import colorsys
import json
import random
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

from common import LILA_DIR, LILA_EXCLUDE, OUR_PIECES, PIECE_CODES, PIECES_DIR, PYCHESS_DIR, PYCHESS_SKIP, SPRITE_PX

FONTS = {
	"dejavu": "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
	"dejavu-bold": "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
	"symbola": "/usr/share/fonts/gdouros-symbola/Symbola.ttf",
	"noto-symbols2": "/usr/share/fonts/google-noto/NotoSansSymbols2-Regular.ttf",
	"stix": "/usr/share/fonts/stix-fonts/STIXTwoMath-Regular.otf",
}
# White glyphs U+2654.. in K Q R B N P order; black = +6.
GLYPH_ROLE = {"K": 0, "Q": 1, "R": 2, "B": 3, "N": 4, "P": 5}


def rsvg(svg: str, px: int = SPRITE_PX) -> np.ndarray:
	out = subprocess.run(
		["rsvg-convert", "-w", str(px), "-h", str(px), "-a", "-b", "none"],
		input=svg.encode(), capture_output=True, check=True,
	).stdout
	im = Image.open(BytesIO(out)).convert("RGBA")
	if im.size != (px, px):  # -a keeps aspect; pad to square
		canvas = Image.new("RGBA", (px, px))
		canvas.paste(im, ((px - im.width) // 2, (px - im.height) // 2))
		im = canvas
	return np.asarray(im)


def save(name: str, arr: np.ndarray) -> None:
	PIECES_DIR.mkdir(parents=True, exist_ok=True)
	np.savez_compressed(PIECES_DIR / f"{name}.npz", sprites=arr)


# ---------- our sprite sets ----------

def hex_hsl(h: float, s: float, l: float) -> str:
	r, g, b = colorsys.hls_to_rgb(h, l, s)
	return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


def random_colors(rng: random.Random) -> dict:
	hw, hb = rng.random(), rng.random()
	return {
		"white": {
			"body": hex_hsl(hw, rng.uniform(0, 0.5), rng.uniform(0.82, 1.0)),
			"line": hex_hsl(hw, rng.uniform(0, 0.4), rng.uniform(0.0, 0.25)),
			"accent": hex_hsl(hw, rng.uniform(0, 0.4), rng.uniform(0.0, 0.3)),
		},
		"black": {
			"body": hex_hsl(hb, rng.uniform(0, 0.5), rng.uniform(0.05, 0.32)),
			"line": hex_hsl(hb, rng.uniform(0, 0.4), rng.uniform(0.0, 0.12)),
			"accent": hex_hsl(hb, rng.uniform(0, 0.3), rng.uniform(0.75, 0.95)),
		},
	}


def _hex(s: str) -> tuple[int, int, int]:
	s = s.lstrip("#")
	if len(s) == 3:
		s = "".join(ch * 2 for ch in s)
	return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def resolve_color_mix(svg: str) -> str:
	"""rsvg-convert does not support CSS color-mix(); precompute `color-mix(in srgb, A[ p%], B[ q%])`."""
	def mix(m: re.Match) -> str:
		a, pa, b, pb = m.group(1), m.group(2), m.group(3), m.group(4)
		if pa is None and pb is None:
			wa = 0.5
		elif pb is not None:
			wa = 1 - float(pb) / 100 if pa is None else float(pa) / (float(pa) + float(pb))
		else:
			wa = float(pa) / 100
		ca, cb = _hex(a), _hex(b)
		return "#%02x%02x%02x" % tuple(round(x * wa + y * (1 - wa)) for x, y in zip(ca, cb))
	return re.sub(
		r"color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,6})(?:\s+([\d.]+)%)?\s*,\s*(#[0-9a-fA-F]{3,6})(?:\s+([\d.]+)%)?\s*\)",
		mix, svg,
	)


def our_set_svgs(entry: dict, sprite: str, colors: dict) -> list[str]:
	inner = re.sub(r"^<svg[^>]*>", "", sprite.strip()).rsplit("</svg>", 1)[0]
	vb = entry["viewBox"]
	out = []
	for code in PIECE_CODES:
		side = "white" if code[0] == "w" else "black"
		sym = code[1] if entry["layout"] == "shared" else code
		c = colors[side]
		body = inner.replace("var(--pc-body)", c["body"]).replace("var(--pc-line)", c["line"]).replace("var(--pc-accent)", c["accent"])
		body = re.sub(r"var\(--pc-[a-z-]+\)", c["line"], body)
		body = resolve_color_mix(body)
		x, y, w, h = vb.split()
		out.append(
			f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{vb}" width="{SPRITE_PX}" height="{SPRITE_PX}">'
			f'{body}<use href="#{sym}" xlink:href="#{sym}" x="{x}" y="{y}" width="{w}" height="{h}"/></svg>'
		)
	return out


def build_ours(variants: int = 3) -> list[tuple[str, list[str]]]:
	manifest = json.loads((OUR_PIECES / "manifest.json").read_text())
	rng = random.Random(1234)
	jobs = []
	for entry in manifest:
		sprite = (OUR_PIECES / entry["id"] / "sprite.svg").read_text()
		jobs.append((f"ours-{entry['id']}", our_set_svgs(entry, sprite, entry["defaultColors"])))
		for v in range(variants):
			jobs.append((f"ours-{entry['id']}-v{v}", our_set_svgs(entry, sprite, random_colors(rng))))
	return jobs


# ---------- lichess sets ----------

def build_lila() -> list[tuple[str, list[str]]]:
	base = LILA_DIR / "public/piece"
	if not base.exists():
		sys.exit("lichess sets missing: run `python src/fetch.py sets` first")
	jobs = []
	for d in sorted(base.iterdir()):
		if not d.is_dir() or d.name in LILA_EXCLUDE:
			continue
		files = [d / f"{c}.svg" for c in PIECE_CODES]
		if not all(f.exists() for f in files):
			continue
		jobs.append((f"lila-{d.name}", [f.read_text() for f in files]))
	return jobs


# ---------- pychess sets (only families lichess does not have) ----------

def build_pychess() -> list[tuple[str, list[str]]]:
	base = PYCHESS_DIR / "pieces"
	lila = {d.name.lower() for d in (LILA_DIR / "public/piece").iterdir()} if (LILA_DIR / "public/piece").exists() else set()
	jobs = []
	if not base.exists():
		return jobs
	for d in sorted(base.iterdir()):
		if not d.is_dir() or d.name in PYCHESS_SKIP or d.name.lower() in lila:
			continue
		files = [d / f"{c[0]}{c[1].lower()}.svg" for c in PIECE_CODES]
		if all(f.exists() for f in files):
			jobs.append((f"pychess-{d.name}", [f.read_text() for f in files]))
	return jobs


# ---------- font glyphs ----------

def glyph_mask(font: ImageFont.FreeTypeFont, ch: str, px: int) -> Image.Image:
	"""Render a glyph as an L mask centered in a px*px canvas."""
	big = px * 2
	im = Image.new("L", (big, big))
	ImageDraw.Draw(im).text((big // 2, big // 2), ch, font=font, fill=255, anchor="mm")
	bbox = im.getbbox()
	if not bbox:
		return Image.new("L", (px, px))
	g = im.crop(bbox)
	scale = 0.92 * px / max(g.size)
	g = g.resize((max(1, round(g.width * scale)), max(1, round(g.height * scale))), Image.LANCZOS)
	out = Image.new("L", (px, px))
	# Glyphs sit on a baseline: center horizontally, bottom-align with a small margin.
	out.paste(g, ((px - g.width) // 2, px - g.height - round(px * 0.04)))
	return out


def fill_holes(mask: Image.Image) -> Image.Image:
	"""Silhouette of a glyph: flood the background from the border; everything else is inside."""
	b = mask.point(lambda v: 255 if v > 100 else 0)
	pad = Image.new("L", (b.width + 2, b.height + 2))
	pad.paste(b, (1, 1))
	ImageDraw.floodfill(pad, (0, 0), 128)
	outside = pad.crop((1, 1, b.width + 1, b.height + 1)).point(lambda v: 255 if v == 128 else 0)
	return ImageChops.invert(outside)


def rgba(color: tuple, mask: Image.Image) -> Image.Image:
	im = Image.new("RGBA", mask.size, color + (0,))
	im.putalpha(mask)
	return im


def build_fonts() -> list[tuple[str, np.ndarray]]:
	"""Modes: 'outline' = white glyph ink only (interior shows the square), 'filled' = white
	interior under the outline glyph, 'gray' = light-gray interior and dark-gray black pieces."""
	out = []
	px = SPRITE_PX
	for name, path in FONTS.items():
		if not Path(path).exists():
			continue
		font = ImageFont.truetype(path, int(px * 1.3))
		for mode in ("outline", "filled", "gray"):
			sprites = []
			for code in PIECE_CODES:
				role = GLYPH_ROLE[code[1]]
				ink = (0, 0, 0) if mode != "gray" else (30, 30, 30)
				if code[0] == "w":
					outline = glyph_mask(font, chr(0x2654 + role), px)
					if mode == "outline":
						im = rgba(ink, outline)
					else:
						sil = fill_holes(glyph_mask(font, chr(0x265A + role), px))
						fillc = (255, 255, 255) if mode == "filled" else (225, 225, 225)
						im = Image.alpha_composite(rgba(fillc, sil), rgba(ink, outline))
				else:
					solid = glyph_mask(font, chr(0x265A + role), px)
					im = rgba(ink if mode != "gray" else (70, 70, 70), solid)
				sprites.append(np.asarray(im))
			out.append((f"font-{name}-{mode}", np.stack(sprites)))
	return out


def main() -> None:
	jobs = build_ours() + build_lila() + build_pychess()
	def run(job: tuple[str, list[str]]) -> str:
		name, svgs = job
		try:
			save(name, np.stack([rsvg(s) for s in svgs]))
			return name
		except Exception as e:  # noqa: BLE001
			return f"FAILED {name}: {e}"
	with ThreadPoolExecutor(16) as ex:
		for r in ex.map(run, jobs):
			if r.startswith("FAILED"):
				print(r)
	for name, arr in build_fonts():
		save(name, arr)
	n = len(list(PIECES_DIR.glob("*.npz")))
	print(f"{n} styles in {PIECES_DIR}")


if __name__ == "__main__":
	main()
