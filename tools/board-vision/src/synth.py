"""Synthetic 2D board generator.

render_board() draws a full board (random squares, texture, pieces, UI overlays, coordinates,
surrounding page) and degrades it like a screenshot / scan. tiles_from_board() then crops every
square the way the browser does (exact grid cell -> 40x40), plus grid-detection jitter.
"""
from __future__ import annotations

import colorsys
import io
import math
import random
import re
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from common import HOLDOUT, INPUT_SIZE, PIECES_DIR, REPO

FONT_FILES = [
	"/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
	"/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
	"/usr/share/fonts/dejavu-sans-fonts/DejaVuSansCondensed-Bold.ttf",
	"/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf",
	"/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf",
	"/usr/share/fonts/liberation-serif-fonts/LiberationSerif-Regular.ttf",
]
FONT_FILES = [f for f in FONT_FILES if __import__("os").path.exists(f)]

# Well-known 2D board palettes (lichess / chess.com / misc sites).
KNOWN_SQUARES = [
	("#f0d9b5", "#b58863"), ("#dee3e6", "#8ca2ad"), ("#ffffdd", "#86a666"), ("#ececec", "#c1c18e"),
	("#f1f1c9", "#f07272"), ("#9f90b0", "#7d4a8d"), ("#eeeed2", "#769656"), ("#ebecd0", "#779556"),
	("#e8edf9", "#b7c0d8"), ("#f0d9b5", "#946f51"), ("#e9edcc", "#779954"), ("#d9e4e8", "#7b9db0"),
	("#ffffff", "#c0c0c0"), ("#ffffff", "#dddddd"), ("#f5f5f5", "#a0a0a0"), ("#ffce9e", "#d18b47"),
	("#eae9d2", "#4b7399"), ("#e0c9a6", "#a67d5d"), ("#c9c9c9", "#7a7a7a"), ("#f0f0f0", "#6e8fa6"),
	("#fdf6e3", "#cfb489"), ("#dcdcdc", "#aaaaaa"), ("#fce4b2", "#d08b18"), ("#e6e6e6", "#4d4d4d"),
]


def _load_theme_squares() -> list[tuple[str, str]]:
	path = REPO / "packages/core/src/theme/boardThemes.ts"
	try:
		src = path.read_text()
	except OSError:
		return []
	lights = re.findall(r"^\t\tlight: '(#[0-9a-fA-F]{6})'", src, re.M)
	darks = re.findall(r"^\t\tdark: '(#[0-9a-fA-F]{6})'", src, re.M)
	return list(zip(lights, darks))


SQUARE_PAIRS = KNOWN_SQUARES + _load_theme_squares()


def hex_rgb(h: str) -> tuple[int, int, int]:
	h = h.lstrip("#")
	return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def hsv(h: float, s: float, v: float) -> tuple[int, int, int]:
	r, g, b = colorsys.hsv_to_rgb(h % 1.0, s, v)
	return int(r * 255), int(g * 255), int(b * 255)


@lru_cache(maxsize=None)
def load_style(name: str) -> np.ndarray:
	return np.load(PIECES_DIR / f"{name}.npz")["sprites"]


def list_styles(split: str) -> list[str]:
	"""split: 'train' (everything but holdout) or 'holdout'."""
	names = sorted(p.stem for p in PIECES_DIR.glob("*.npz"))

	def base(n: str) -> str:
		n = re.sub(r"-v\d+$", "", n)
		return re.sub(r"-(outline|filled|gray)$", "", n) if n.startswith("font-") else n

	if split == "holdout":
		return [n for n in names if base(n) in HOLDOUT]
	return [n for n in names if base(n) not in HOLDOUT]


@lru_cache(maxsize=64)
def font(path: str, size: int) -> ImageFont.FreeTypeFont:
	return ImageFont.truetype(path, size)


# ---------------------------------------------------------------- textures

def smooth_noise(rng: np.random.Generator, h: int, w: int, cells: float, aniso: float = 1.0) -> np.ndarray:
	"""Value noise in [-1, 1], upscaled from a coarse random grid."""
	gh = max(2, int(cells))
	gw = max(2, int(cells * aniso))
	g = rng.standard_normal((gh, gw)).astype(np.float32)
	im = Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC)
	a = np.asarray(im)
	return a / (np.abs(a).max() + 1e-6)


def texture_field(rng: np.random.Generator, h: int, w: int, kind: str) -> np.ndarray:
	if kind == "wood":
		n = smooth_noise(rng, h, w, rng.uniform(3, 8), aniso=0.25)
		y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
		f = rng.uniform(15, 50)
		return np.sin((y + 0.08 * n) * f * math.pi) * 0.6 + 0.4 * smooth_noise(rng, h, w, 40, 0.2)
	if kind == "marble":
		n = smooth_noise(rng, h, w, rng.uniform(4, 10)) + 0.5 * smooth_noise(rng, h, w, 20)
		x = np.linspace(0, 1, w, dtype=np.float32)[None, :]
		y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
		return np.abs(np.sin((x + y) * rng.uniform(3, 9) + n * 3.0)) ** 6 * 2 - 1
	if kind == "grain":
		return rng.standard_normal((h, w)).astype(np.float32) * 0.5
	if kind == "gradient":
		x = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
		y = np.linspace(-1, 1, h, dtype=np.float32)[:, None]
		a = rng.uniform(0, 2 * math.pi)
		return np.broadcast_to(x * math.cos(a) + y * math.sin(a), (h, w)).copy()
	return smooth_noise(rng, h, w, rng.uniform(6, 30))  # mottled (felt / paper / slate)


# ---------------------------------------------------------------- board render

@dataclass
class Board:
	image: Image.Image  # RGB
	x0: float
	y0: float
	cell: float
	grid: np.ndarray  # 8x8 class ids, row 0 = top of the IMAGE (not necessarily rank 8)


def random_grid(rng: random.Random, empty_p: float) -> np.ndarray:
	g = np.zeros((8, 8), np.int64)
	for r in range(8):
		for c in range(8):
			if rng.random() >= empty_p:
				g[r, c] = rng.randint(1, 12)
	return g


def pick_squares(rng: random.Random) -> tuple[tuple[int, int, int], tuple[int, int, int], str]:
	"""Returns (light, dark, style) where style in normal|book|plain."""
	u = rng.random()
	if u < 0.45:
		lt, dk = rng.choice(SQUARE_PAIRS)
		light, dark = hex_rgb(lt), hex_rgb(dk)
		if rng.random() < 0.5:  # small hue/brightness drift
			light = tuple(int(np.clip(v + rng.randint(-12, 12), 0, 255)) for v in light)
			dark = tuple(int(np.clip(v + rng.randint(-15, 15), 0, 255)) for v in dark)
		return light, dark, "normal"
	if u < 0.80:
		h = rng.random()
		light = hsv(h + rng.uniform(-0.08, 0.08), rng.uniform(0, 0.35), rng.uniform(0.75, 1.0))
		dark = hsv(h, rng.uniform(0.1, 0.75), rng.uniform(0.3, 0.75))
		if rng.random() < 0.08:  # inverted contrast / dark themes
			light = hsv(h, rng.uniform(0, 0.4), rng.uniform(0.35, 0.6))
			dark = hsv(h, rng.uniform(0, 0.5), rng.uniform(0.12, 0.35))
		return light, dark, "normal"
	if u < 0.94:
		return (255, 255, 255), (rng.randint(150, 215),) * 3, "book"
	w = rng.randint(235, 255)
	return (w, w, w), (w, w, w), "plain"


def draw_hatch(d: ImageDraw.ImageDraw, x0: float, y0: float, s: float, rng_vals: tuple) -> None:
	spacing, width, color, angle = rng_vals
	# Diagonal lines clipped to the square: draw on a separate layer by the caller.
	n = int(2 * s / spacing) + 2
	for i in range(-n, n):
		o = i * spacing
		if angle == 0:
			d.line([(x0 + o, y0 + s), (x0 + o + s, y0)], fill=color, width=width)
		else:
			d.line([(x0 + o, y0), (x0 + o + s, y0 + s)], fill=color, width=width)


# ---------------------------------------------------------------- piece-art augmentation

def _duotone(rgb: np.ndarray, lo: np.ndarray, hi: np.ndarray, gamma: float) -> np.ndarray:
	lum = (rgb @ np.array([0.299, 0.587, 0.114], np.float32)) / 255.0
	lum = lum[..., None] ** gamma
	return lo + (hi - lo) * lum


def vary_sprites(rng: random.Random, sprites: np.ndarray) -> np.ndarray:
	"""Per-board random restyle of a piece set, so the model sees far more art than the raw sets:
	duotone recolor, binarized "book" ink, outline-only white pieces, stretch / tilt / bolder lines."""
	u = rng.random()
	out = sprites
	if u < 0.45:
		return sprites
	f = sprites.astype(np.float32)
	rgb, a = f[..., :3], f[..., 3:]
	if u < 0.7:  # duotone recolor, keeping white light and black dark
		new = np.empty_like(rgb)
		for side, sl in (("w", slice(0, 6)), ("b", slice(6, 12))):
			h = rng.random()
			if side == "w":
				lo = hsv(h, rng.uniform(0, 0.6), rng.uniform(0.0, 0.35))
				hi = hsv(h + rng.uniform(-0.1, 0.1), rng.uniform(0, 0.45), rng.uniform(0.8, 1.0))
			else:
				lo = hsv(h, rng.uniform(0, 0.6), rng.uniform(0.0, 0.2))
				hi = hsv(h + rng.uniform(-0.1, 0.1), rng.uniform(0, 0.6), rng.uniform(0.45, 1.0))
			new[sl] = _duotone(rgb[sl], np.array(lo, np.float32), np.array(hi, np.float32), rng.uniform(0.6, 1.6))
		out = np.concatenate([new, a], axis=-1)
	elif u < 0.85:  # binarized ink (book / print diagrams); white interiors maybe transparent
		lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
		ink = np.array([rng.randint(0, 60)] * 3, np.float32)
		paper = np.array([255, 255, 255], np.float32)
		thr = rng.uniform(90, 170)
		dark = (lum < thr)[..., None]
		new = np.where(dark, ink, paper)
		alpha = a.copy()
		if rng.random() < 0.5:  # outline-only white pieces: light interior shows the square
			alpha[:6] = np.where(dark[:6], a[:6], 0)
		out = np.concatenate([new, alpha], axis=-1)
	else:
		out = f
	out = np.clip(out, 0, 255).astype(np.uint8)
	if rng.random() < 0.35:  # geometry: stretch, tilt, bolder strokes
		sx = rng.uniform(0.85, 1.12)
		sy = rng.uniform(0.88, 1.08)
		rot = rng.uniform(-4, 4)
		bold = rng.random() < 0.3
		res = []
		n = out.shape[1]
		for spr in out:
			im = Image.fromarray(spr)
			im = im.resize((max(8, int(n * sx)), max(8, int(n * sy))), Image.BICUBIC).rotate(rot, Image.BICUBIC, expand=False)
			if bold:
				rgbim = im.convert("RGB").filter(ImageFilter.MinFilter(3))
				al = im.getchannel("A").filter(ImageFilter.MaxFilter(3))
				im = Image.merge("RGBA", (*rgbim.split(), al))
			canvas = Image.new("RGBA", (n, n))
			canvas.paste(im, ((n - im.width) // 2, n - im.height - (n - im.height) // 3 if im.height < n else (n - im.height) // 2))
			res.append(np.asarray(canvas))
		out = np.stack(res)
	return out


def render_board(rng: random.Random, styles: list[str], cell: float | None = None,
		empty_p: float = 0.3, grid: np.ndarray | None = None, ui_margin: bool = False,
		squares: tuple | None = None, piece_style: str | None = None, flip: bool | None = None,
		origin: tuple[int, int] | None = None, highlights: list[tuple[int, int]] | None = None) -> Board:
	nrng = np.random.default_rng(rng.getrandbits(32))
	s = cell if cell is not None else math.exp(rng.uniform(math.log(14), math.log(110)))
	board_px = s * 8
	# Page around the board.
	m = [rng.uniform(0.15, 1.2) * s for _ in range(4)]  # left, top, right, bottom
	if ui_margin:
		m = [rng.uniform(0.5, 4) * s for _ in range(4)]
	W = int(math.ceil(board_px + m[0] + m[2]))
	H = int(math.ceil(board_px + m[1] + m[3]))
	if origin is not None:
		m[0], m[1] = origin
	x0, y0 = m[0], m[1]
	bgv = rng.random()
	bg = hsv(rng.random(), rng.uniform(0, 0.3), rng.uniform(0.85, 1) if bgv < 0.5 else rng.uniform(0.08, 0.35))
	img = Image.new("RGB", (W, H), bg)
	d = ImageDraw.Draw(img)

	light, dark, sq_style = squares if squares is not None else pick_squares(rng)
	frame = rng.random()
	if frame < 0.3:  # board frame / border
		fw = rng.uniform(0.05, 0.5) * s
		fc = hsv(rng.random(), rng.uniform(0, 0.6), rng.uniform(0.05, 0.6))
		d.rectangle([x0 - fw, y0 - fw, x0 + board_px + fw, y0 + board_px + fw], fill=fc)
	elif frame < 0.45 or sq_style != "normal":
		lw = rng.randint(1, 3)
		d.rectangle([x0 - lw, y0 - lw, x0 + board_px + lw - 1, y0 + board_px + lw - 1], fill=(0, 0, 0))

	# Square layer with optional texture.
	bx, by = int(round(x0)), int(round(y0))
	bw = int(round(x0 + board_px)) - bx
	sqimg = np.zeros((bw, bw, 3), np.float32)
	edges = np.round(np.arange(9) * s).astype(int)
	for r in range(8):
		for c in range(8):
			col = light if (r + c) % 2 == 0 else dark
			sqimg[edges[r]:edges[r + 1], edges[c]:edges[c + 1]] = col
	if sq_style == "normal" and rng.random() < 0.4:
		kind = rng.choice(["wood", "marble", "grain", "gradient", "mottled"])
		amp = rng.uniform(4, 25) if kind != "grain" else rng.uniform(2, 10)
		field = texture_field(nrng, bw, bw, kind)
		if rng.random() < 0.5:  # per-square independent texture offsets look like real wood boards
			field2 = texture_field(nrng, bw, bw, kind)
			mask = np.zeros((bw, bw), bool)
			for r in range(8):
				for c in range(8):
					if (r + c + rng.randint(0, 1)) % 2:
						mask[edges[r]:edges[r + 1], edges[c]:edges[c + 1]] = True
			field = np.where(mask, field2, field)
		sqimg += field[..., None] * amp
	img.paste(Image.fromarray(np.clip(sqimg, 0, 255).astype(np.uint8)), (bx, by))
	d = ImageDraw.Draw(img, "RGBA")

	if sq_style == "book" and rng.random() < 0.7:
		hatch = (rng.uniform(2, max(2.5, s / 7)), rng.randint(1, 2), (0, 0, 0, rng.randint(140, 255)), rng.randint(0, 1))
		# Hatched dark squares replace the flat gray.
		layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
		ld = ImageDraw.Draw(layer)
		for r in range(8):
			for c in range(8):
				if (r + c) % 2:
					xa, ya = x0 + edges[c], y0 + edges[r]
					d.rectangle([xa, ya, xa + s, ya + s], fill=(255, 255, 255))
					draw_hatch(ld, xa, ya, s, hatch)
		mask = Image.new("L", img.size, 0)
		md = ImageDraw.Draw(mask)
		for r in range(8):
			for c in range(8):
				if (r + c) % 2:
					md.rectangle([x0 + edges[c], y0 + edges[r], x0 + edges[c + 1] - 1, y0 + edges[r + 1] - 1], fill=255)
		layer.putalpha(Image.fromarray(np.minimum(np.asarray(layer)[..., 3], np.asarray(mask))))
		img.paste(layer, (0, 0), layer)
		d = ImageDraw.Draw(img, "RGBA")
	if sq_style == "plain" or (sq_style == "book" and rng.random() < 0.3):
		gc = (rng.randint(0, 120),) * 3
		for i in range(9):
			d.line([(x0 + edges[i], y0), (x0 + edges[i], y0 + board_px)], fill=gc, width=1)
			d.line([(x0, y0 + edges[i]), (x0 + board_px, y0 + edges[i])], fill=gc, width=1)

	g = grid if grid is not None else random_grid(rng, empty_p)
	sq = lambda r, c: (x0 + edges[c], y0 + edges[r])  # noqa: E731

	# Under-piece highlights.
	if highlights or (highlights is None and rng.random() < 0.55):
		colr = rng.choice([(205, 210, 106), (246, 246, 105), (155, 199, 0), (120, 180, 230), (214, 170, 90), (255, 255, 51), (170, 162, 58)])
		a = rng.randint(70, 200)
		for r, c in highlights or [(rng.randrange(8), rng.randrange(8)) for _ in range(2)]:
			xa, ya = sq(r, c)
			d.rectangle([xa, ya, xa + s - 1, ya + s - 1], fill=colr + (a,))
	if rng.random() < 0.2:  # selected / premove
		colr = rng.choice([(20, 85, 30), (186, 202, 68), (30, 50, 110), (40, 110, 190), (255, 0, 0)])
		xa, ya = sq(rng.randrange(8), rng.randrange(8))
		d.rectangle([xa, ya, xa + s - 1, ya + s - 1], fill=colr + (rng.randint(60, 150),))
	if rng.random() < 0.15:  # check glow on a king
		kings = list(zip(*np.where((g == 6) | (g == 12))))
		if kings:
			r, c = rng.choice(kings)
			xa, ya = sq(r, c)
			glow = Image.new("RGBA", (int(s) + 1, int(s) + 1))
			yy, xx = np.mgrid[0:glow.height, 0:glow.width]
			dist = np.hypot(xx - s / 2, yy - s / 2) / (s / 2)
			al = np.clip(1 - dist, 0, 1) ** rng.uniform(0.6, 1.5) * rng.randint(150, 255)
			arr = np.zeros((glow.height, glow.width, 4), np.uint8)
			arr[..., 0] = 255
			arr[..., 1] = rng.randint(0, 40)
			arr[..., 3] = al.astype(np.uint8)
			glow = Image.fromarray(arr)
			img.paste(glow, (int(xa), int(ya)), glow)
	if rng.random() < 0.1:  # hover outline
		xa, ya = sq(rng.randrange(8), rng.randrange(8))
		w = max(1, int(s * rng.uniform(0.03, 0.08)))
		d.rectangle([xa, ya, xa + s - 1, ya + s - 1], outline=(255, 255, 255, 200), width=w)

	# Coordinates inside edge squares (lichess / chess.com) or outside the board.
	coords = rng.random()
	if FONT_FILES and coords < 0.6:
		fpath = rng.choice(FONT_FILES)
		fs = max(6, int(s * rng.uniform(0.14, 0.26)))
		f = font(fpath, fs)
		files = "hgfedcba" if (flip if flip is not None else rng.random() < 0.4) else "abcdefgh"
		ranks = "87654321" if files[0] == "a" else "12345678"
		inside = coords < 0.45
		pad = s * rng.uniform(0.03, 0.08)
		for i in range(8):
			if inside:
				col = dark if (7 + i) % 2 == 0 else light
				xa, ya = sq(7, i)
				d.text((xa + s - pad, ya + s - pad), files[i], fill=col, font=f, anchor="rd")
				col = dark if (i + 0) % 2 == 0 else light
				xa, ya = sq(i, 0)
				d.text((xa + pad, ya + pad), ranks[i], fill=col, font=f, anchor="lt")
			else:
				fc = (0, 0, 0) if bgv < 0.5 else (230, 230, 230)
				xa, ya = sq(7, i)
				d.text((xa + s / 2, ya + s + s * 0.1), files[i], fill=fc, font=f, anchor="mt")
				xa, ya = sq(i, 0)
				d.text((xa - s * 0.1, ya + s / 2), ranks[i], fill=fc, font=f, anchor="rm")

	# Pieces.
	style = piece_style or rng.choice(styles)
	sprites = load_style(style)
	if piece_style is None:
		sprites = vary_sprites(rng, sprites)
	scale = rng.uniform(0.72, 1.0) if not style.startswith("font-") else rng.uniform(0.7, 0.95)
	dy_bias = rng.uniform(-0.04, 0.04)
	resample = rng.choice([Image.LANCZOS, Image.BILINEAR, Image.BICUBIC, Image.BOX])
	shadow = rng.random() < 0.1
	knock = sq_style == "book" and rng.random() < 0.5  # white halo behind pieces on hatched squares
	cache: dict[tuple[int, int], Image.Image] = {}
	for r in range(8):
		for c in range(8):
			k = int(g[r, c])
			if not k:
				continue
			ps = max(4, int(round(s * scale * rng.uniform(0.97, 1.03))))
			key = (k, ps)
			if key not in cache:
				cache[key] = Image.fromarray(sprites[k - 1]).resize((ps, ps), resample)
			p = cache[key]
			xa, ya = sq(r, c)
			px = int(round(xa + (s - ps) / 2 + rng.uniform(-0.03, 0.03) * s))
			py = int(round(ya + (s - ps) / 2 + (dy_bias + rng.uniform(-0.03, 0.03)) * s))
			if knock and (r + c) % 2:
				halo = p.getchannel("A").filter(ImageFilter.MaxFilter(3))
				img.paste((255, 255, 255), (px, py), halo)
			if shadow:
				sh = Image.new("RGBA", p.size, (0, 0, 0, 0))
				sh.putalpha(p.getchannel("A").point(lambda v: v * 0.35))
				img.paste(sh, (px + max(1, int(s * 0.03)), py + max(1, int(s * 0.03))), sh)
			img.paste(p, (px, py), p)

	d = ImageDraw.Draw(img, "RGBA")
	# Over-piece overlays: legal-move dots on empties, capture rings / corner marks on pieces.
	if rng.random() < 0.3:
		dc = rng.choice([(20, 85, 30), (0, 0, 0), (40, 110, 190), (100, 100, 100)]) + (rng.randint(40, 120),)
		rad = s * rng.uniform(0.1, 0.2)
		ring_style = rng.choice(["ring", "corners", "ringthin"])
		for _ in range(rng.randint(2, 10)):
			r, c = rng.randrange(8), rng.randrange(8)
			xa, ya = sq(r, c)
			cx, cy = xa + s / 2, ya + s / 2
			if g[r, c] == 0:
				d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=dc)
			elif ring_style == "corners":
				t = s * 0.25
				for (ax, ay, sx, sy) in ((xa, ya, 1, 1), (xa + s, ya, -1, 1), (xa, ya + s, 1, -1), (xa + s, ya + s, -1, -1)):
					d.polygon([(ax, ay), (ax + sx * t, ay), (ax, ay + sy * t)], fill=dc)
			else:
				w = max(1, int(s * (0.08 if ring_style == "ring" else 0.04)))
				d.ellipse([xa + 1, ya + 1, xa + s - 2, ya + s - 2], outline=dc, width=w)
	if rng.random() < 0.15:  # arrows
		ac = rng.choice([(21, 120, 27), (255, 170, 0), (40, 110, 200), (230, 40, 30)]) + (rng.randint(110, 200),)
		for _ in range(rng.randint(1, 3)):
			r1, c1, r2, c2 = rng.randrange(8), rng.randrange(8), rng.randrange(8), rng.randrange(8)
			if (r1, c1) == (r2, c2):
				continue
			a = sq(r1, c1)
			b = sq(r2, c2)
			p1 = (a[0] + s / 2, a[1] + s / 2)
			p2 = (b[0] + s / 2, b[1] + s / 2)
			w = max(2, int(s * rng.uniform(0.12, 0.22)))
			ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
			hl = s * 0.35
			tip = (p2[0] - math.cos(ang) * s * 0.2, p2[1] - math.sin(ang) * s * 0.2)
			base = (tip[0] - math.cos(ang) * hl, tip[1] - math.sin(ang) * hl)
			d.line([p1, base], fill=ac, width=w)
			nx, ny = -math.sin(ang) * hl * 0.6, math.cos(ang) * hl * 0.6
			d.polygon([tip, (base[0] + nx, base[1] + ny), (base[0] - nx, base[1] - ny)], fill=ac)

	return Board(image=img, x0=x0, y0=y0, cell=s, grid=g)


# ---------------------------------------------------------------- degradations

def degrade(rng: random.Random, b: Board) -> Board:
	img = b.image
	x0, y0, s = b.x0, b.y0, b.cell
	if rng.random() < 0.35:  # screenshot re-scaling (HiDPI / zoom)
		f = math.exp(rng.uniform(math.log(0.6), math.log(1.6)))
		nw, nh = max(8, int(img.width * f)), max(8, int(img.height * f))
		fx, fy = nw / img.width, nh / img.height
		img = img.resize((nw, nh), rng.choice([Image.BILINEAR, Image.LANCZOS, Image.BOX, Image.BICUBIC]))
		x0, y0, s = x0 * fx, y0 * fy, s * (fx + fy) / 2
	if rng.random() < 0.15:
		img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2)))
	arr = None
	if rng.random() < 0.5:  # color jitter
		arr = np.asarray(img).astype(np.float32)
		arr = (arr - 128) * rng.uniform(0.75, 1.25) + 128 + rng.uniform(-25, 25)
		if rng.random() < 0.5:
			gray = arr.mean(axis=2, keepdims=True)
			arr = gray + (arr - gray) * rng.uniform(0.5, 1.4)
	if rng.random() < 0.08:
		arr = np.asarray(img).astype(np.float32) if arr is None else arr
		arr = np.repeat(arr.mean(axis=2, keepdims=True), 3, axis=2)
	if rng.random() < 0.2:
		arr = np.asarray(img).astype(np.float32) if arr is None else arr
		arr = arr + np.random.default_rng(rng.getrandbits(32)).normal(0, rng.uniform(2, 10), arr.shape)
	if arr is not None:
		img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
	u = rng.random()
	if u < 0.35:
		buf = io.BytesIO()
		img.save(buf, "JPEG", quality=rng.randint(40, 95))
		img = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
	elif u < 0.5:  # GIF-like palette (lichess GIF export, old sites)
		img = img.quantize(colors=rng.choice([32, 64, 128, 256]), dither=rng.choice([Image.Dither.NONE, Image.Dither.FLOYDSTEINBERG])).convert("RGB")
	return Board(image=img, x0=x0, y0=y0, cell=s, grid=b.grid)


# ---------------------------------------------------------------- tiles

def crop_tile(img: Image.Image, x: float, y: float, s: float, resample=Image.LANCZOS) -> np.ndarray:
	"""Exact grid cell -> INPUT_SIZE^2 RGB uint8 (mirrors the browser's drawImage resample)."""
	t = img.resize((INPUT_SIZE, INPUT_SIZE), resample, box=(x, y, x + s, y + s))
	return np.asarray(t)


def tiles_from_board(rng: random.Random, b: Board, jitter: bool = True) -> tuple[np.ndarray, np.ndarray]:
	out = np.zeros((64, INPUT_SIZE, INPUT_SIZE, 3), np.uint8)
	labels = b.grid.reshape(-1).copy()
	s = b.cell
	pad = int(math.ceil(0.25 * s)) + 2  # jittered crops may poke past the page edge
	img = Image.fromarray(np.pad(np.asarray(b.image), ((pad, pad), (pad, pad), (0, 0)), mode="edge"))
	bx0, by0 = b.x0 + pad, b.y0 + pad
	# Grid-level error (the detector is off as a whole) + per-tile error.
	gdx, gdy = (rng.uniform(-0.04, 0.04) * s, rng.uniform(-0.04, 0.04) * s) if jitter else (0, 0)
	gscale = rng.uniform(0.98, 1.02) if jitter else 1.0
	resample = rng.choice([Image.LANCZOS, Image.BILINEAR, Image.BICUBIC, Image.BOX, Image.HAMMING])
	for r in range(8):
		for c in range(8):
			ss = s * gscale
			x = bx0 + gdx + c * ss
			y = by0 + gdy + r * ss
			cs = ss
			if jitter:
				k = rng.uniform(0.93, 1.07)
				cs = ss * k
				x += (ss - cs) / 2 + rng.uniform(-0.04, 0.04) * s
				y += (ss - cs) / 2 + rng.uniform(-0.04, 0.04) * s
			out[r * 8 + c] = crop_tile(img, x, y, cs, resample)
	return out, labels


def sample_tiles(rng: random.Random, styles: list[str]) -> tuple[np.ndarray, np.ndarray]:
	b = render_board(rng, styles)
	b = degrade(rng, b)
	return tiles_from_board(rng, b)
