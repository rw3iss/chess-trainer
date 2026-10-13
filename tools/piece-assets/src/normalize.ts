/**
 * Normalize one source piece SVG into a recolorable <symbol> body.
 *
 * Every solid paint is classified against the side's anchor colours
 * (body / line / accent) and rewritten as an inline style using CSS vars:
 *   exact anchor          → var(--pc-body) | var(--pc-line) | var(--pc-accent)
 *   in-between tone       → color-mix(in srgb, var(--pc-x), #fff|#000 N%)  (neutral mode)
 *                           color-mix(in srgb, var(--pc-a) N%, var(--pc-b)) (interpolate mode)
 * Gradient fills become a solid role colour plus a cloned overlay filled with a
 * neutral white/black alpha gradient (class pc-shade, opacity × var(--pc-shade)),
 * so shading survives any base colour. Low-opacity neutral overlays are tagged pc-shade.
 */
import { optimize, type CustomPlugin, type XastElement, type XastParent, type XastChild } from 'svgo';
import { distance, lightness, mean, parseColor, toHex, type Rgb } from './color.js';

export interface Anchors {
	body: string;
	line: string;
	accent?: string;
}

export type ToneMode = 'neutral' | 'interpolate';

export interface NormalizeOptions {
	anchors: Anchors;
	tones: ToneMode;
	/** Prefix for every internal id (gradients, clips, filters). */
	idPrefix: string;
}

export interface NormalizedPiece {
	viewBox: string;
	/** Inner markup for the <symbol>. */
	body: string;
}

type RoleName = 'body' | 'line' | 'accent';

interface AnchorInfo {
	role: RoleName;
	rgb: Rgb;
	L: number;
}

const EXACT_TOLERANCE = 26;
const SHADE_STYLE = 'opacity:var(--pc-shade,1)';

function anchorList(a: Anchors): AnchorInfo[] {
	const out: AnchorInfo[] = [];
	for (const role of ['body', 'line', 'accent'] as RoleName[]) {
		const v = a[role];
		if (!v) continue;
		const rgb = parseColor(v);
		if (!rgb) throw new Error(`bad anchor ${role}=${v}`);
		out.push({ role, rgb, L: lightness(rgb) });
	}
	return out;
}

const roleVar = (r: RoleName) => `var(--pc-${r})`;
const pct = (n: number) => Math.max(1, Math.min(100, Math.round(n * 100)));

/** Map a concrete colour to a CSS paint expression built from role vars. */
export function classifyPaint(color: Rgb, kind: 'fill' | 'stroke', anchors: Anchors, tones: ToneMode): string {
	const list = anchorList(anchors);
	const prefer: RoleName[] = kind === 'fill' ? ['body', 'accent', 'line'] : ['line', 'accent', 'body'];
	const close = list
		.map((a) => ({ a, d: distance(a.rgb, color) }))
		.filter((x) => x.d <= EXACT_TOLERANCE)
		.sort((x, y) => x.d - y.d);
	if (close.length) {
		const best = close[0]!.d;
		const ties = close.filter((x) => x.d - best < 6).map((x) => x.a.role);
		const role = prefer.find((r) => ties.includes(r))!;
		return roleVar(role);
	}
	const L = lightness(color);
	const sorted = [...list].sort((x, y) => x.L - y.L);
	if (tones === 'interpolate') {
		for (let i = 0; i < sorted.length - 1; i++) {
			const lo = sorted[i]!;
			const hi = sorted[i + 1]!;
			if (L >= lo.L && L <= hi.L && hi.L - lo.L > 0.5) {
				const t = (L - lo.L) / (hi.L - lo.L);
				return `color-mix(in srgb, ${roleVar(hi.role)} ${pct(t)}%, ${roleVar(lo.role)})`;
			}
		}
	}
	// Neutral: nearest anchor by lightness, lightened/darkened with white/black.
	let ref = sorted[0]!;
	let bestD = Infinity;
	for (const a of list) {
		const d = Math.abs(a.L - L) + (a.role === 'body' ? -4 : 0);
		if (d < bestD) {
			bestD = d;
			ref = a;
		}
	}
	const mix = (to: '#fff' | '#000', t: number) =>
		t < 0.01 ? roleVar(ref.role) : t > 0.995 ? to : `color-mix(in srgb, ${roleVar(ref.role)}, ${to} ${pct(t)}%)`;
	if (L >= ref.L) {
		const t = ref.L >= 99.5 ? 0 : (L - ref.L) / (100 - ref.L);
		return mix('#fff', t);
	}
	const t = ref.L <= 0.5 ? 0 : (ref.L - L) / ref.L;
	return mix('#000', t);
}

// ── xast helpers ──────────────────────────────────────────────────────────

const isEl = (n: XastChild): n is XastElement => n.type === 'element';

function parseStyle(s: string | undefined): Map<string, string> {
	const m = new Map<string, string>();
	if (!s) return m;
	for (const part of s.split(';')) {
		const i = part.indexOf(':');
		if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
	}
	return m;
}

function writeStyle(el: XastElement, m: Map<string, string>): void {
	if (!m.size) {
		delete el.attributes.style;
		return;
	}
	el.attributes.style = [...m].map(([k, v]) => `${k}:${v}`).join(';');
}

/** Read a presentation property from attribute or inline style. */
function prop(el: XastElement, name: string): string | undefined {
	const st = parseStyle(el.attributes.style);
	return st.get(name) ?? el.attributes[name];
}

function takeProp(el: XastElement, name: string): string | undefined {
	const st = parseStyle(el.attributes.style);
	const v = st.get(name) ?? el.attributes[name];
	st.delete(name);
	delete el.attributes[name];
	writeStyle(el, st);
	return v;
}

function setStyle(el: XastElement, name: string, value: string): void {
	const st = parseStyle(el.attributes.style);
	st.set(name, value);
	writeStyle(el, st);
}

function addClass(el: XastElement, cls: string): void {
	const cur = (el.attributes.class ?? '').split(/\s+/).filter(Boolean);
	if (!cur.includes(cls)) cur.push(cls);
	el.attributes.class = cur.join(' ');
}

function cloneEl<T extends XastChild>(n: T): T {
	if (n.type !== 'element') return { ...n };
	const copy: XastElement = { type: 'element', name: n.name, attributes: { ...n.attributes }, children: [] };
	copy.children = n.children.map((c) => cloneEl(c));
		return copy as T;
}

function walk(node: XastParent, fn: (el: XastElement, parent: XastParent) => void, skip?: string[]): void {
	for (const c of [...node.children]) {
		if (isEl(c)) {
			if (skip?.includes(c.name)) continue;
			fn(c, node);
			walk(c, fn, skip);
		}
	}
}

const NON_RENDER = ['linearGradient', 'radialGradient', 'clipPath', 'mask', 'filter', 'style', 'title', 'desc', 'metadata'];

const isNeutral = (c: Rgb) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 18;

interface GradientInfo {
	el: XastElement;
	stops: { color: Rgb; opacity: number; offset: string }[];
	geom: Record<string, string>;
}

const GEOM_ATTRS = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod'];

function hrefOf(el: XastElement): string | undefined {
	const h = el.attributes.href ?? el.attributes['xlink:href'];
	return h?.startsWith('#') ? h.slice(1) : undefined;
}

function collectGradients(root: XastParent): Map<string, GradientInfo> {
	const raw = new Map<string, XastElement>();
	walk(root, (el) => {
		if ((el.name === 'linearGradient' || el.name === 'radialGradient') && el.attributes.id) raw.set(el.attributes.id, el);
	});
	const out = new Map<string, GradientInfo>();
	const resolve = (id: string, depth = 0): GradientInfo | undefined => {
		if (out.has(id)) return out.get(id);
		const el = raw.get(id);
		if (!el || depth > 8) return undefined;
		const base = hrefOf(el) ? resolve(hrefOf(el)!, depth + 1) : undefined;
		const ownStops = el.children.filter(isEl).filter((c) => c.name === 'stop');
		const stops = ownStops.length
			? ownStops.map((s) => ({
					color: parseColor(prop(s, 'stop-color') ?? '#000') ?? { r: 0, g: 0, b: 0 },
					opacity: parseFloat(prop(s, 'stop-opacity') ?? '1'),
					offset: s.attributes.offset ?? '0',
				}))
			: (base?.stops ?? []);
		const geom: Record<string, string> = { ...(base?.geom ?? {}) };
		for (const a of GEOM_ATTRS) if (el.attributes[a] !== undefined) geom[a] = el.attributes[a]!;
		const info: GradientInfo = { el, stops, geom };
		out.set(id, info);
		return info;
	};
	for (const id of raw.keys()) resolve(id);
	return out;
}

const urlId = (v: string | undefined) => /^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/.exec(v ?? '')?.[1];

// ── main transform ────────────────────────────────────────────────────────

function transform(root: XastParent, opts: NormalizeOptions, result: { viewBox: string }): void {
	const svg = root.children.find(isEl);
	if (!svg || svg.name !== 'svg') throw new Error('no <svg> root');

	let vb = svg.attributes.viewBox;
	if (!vb) {
		const w = parseFloat(svg.attributes.width ?? '0');
		const h = parseFloat(svg.attributes.height ?? '0');
		vb = `0 0 ${w} ${h}`;
	}
	// Make square, centered.
	const [x, y, w, h] = vb.split(/[\s,]+/).map(Number) as [number, number, number, number];
	if (Math.abs(w - h) > 1e-6) {
		const s = Math.max(w, h);
		vb = `${+(x - (s - w) / 2).toFixed(3)} ${+(y - (s - h) / 2).toFixed(3)} ${s} ${s}`;
	}
	result.viewBox = vb;

	// Move inheritable presentation attributes onto a wrapper <g>.
	const wrapper: XastElement = { type: 'element', name: 'g', attributes: {}, children: [] };
	const INHERIT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity'];
	for (const a of INHERIT) {
		const v = prop(svg, a);
		if (v !== undefined) wrapper.attributes[a] = v;
	}
	if (wrapper.attributes.fill === undefined) wrapper.attributes.fill = '#000';
	wrapper.children = svg.children;
	svg.children = [wrapper];

	const grads = collectGradients(wrapper);
	const usedAsShade = new Set<string>();
	const newDefs: XastElement[] = [];
	const { anchors, tones } = opts;
	const bodyRgb = parseColor(anchors.body)!;

	const handlePaint = (el: XastElement, parent: XastParent, kind: 'fill' | 'stroke') => {
		const raw = takeProp(el, kind);
		if (raw === undefined) return;
		const v = raw === 'currentColor' ? '#000' : raw;
		if (v === 'none' || v === 'transparent') {
			setStyle(el, kind, 'none');
			return;
		}
		const gid = urlId(v);
		if (gid) {
			const g = grads.get(gid);
			if (!g || !g.stops.length) {
				setStyle(el, kind, roleVar(kind === 'fill' ? 'body' : 'line'));
				return;
			}
			const m = mean(g.stops.map((s) => s.color));
			const translucent = g.stops.some((s) => s.opacity < 0.98);
			const neutral = g.stops.every((s) => isNeutral(s.color) && (lightness(s.color) > 88 || lightness(s.color) < 12));
			if (kind === 'fill' && translucent && neutral && distance(m, bodyRgb) > EXACT_TOLERANCE) {
				// Already a neutral highlight/shadow overlay: keep it, tag as shade.
				setStyle(el, kind, v);
				usedAsShade.add(gid);
				addClass(el, 'pc-shade');
				setStyle(el, 'opacity', `calc(${el.attributes.opacity ?? '1'} * var(--pc-shade,1))`);
				delete el.attributes.opacity;
				return;
			}
			setStyle(el, kind, classifyPaint(m, kind, anchors, tones));
			if (kind !== 'fill') return;
			// Neutral shade overlay reproducing the gradient's light/dark spread.
			const M = lightness(m);
			const spread = g.stops.map((s) => lightness(s.color));
			if (Math.max(...spread) - Math.min(...spread) < 4) return;
			const shadeId = `shade-${gid}`;
			if (!newDefs.some((d) => d.attributes.id === shadeId)) {
				const stops: XastElement[] = g.stops.map((s, i) => {
					const Li = spread[i]!;
					const white = Li >= M;
					const a = white ? (M >= 99.9 ? 0 : (Li - M) / (100 - M)) : M <= 0.1 ? 0 : (M - Li) / M;
					return {
						type: 'element',
						name: 'stop',
						attributes: {
							offset: s.offset,
							'stop-color': white ? '#fff' : '#000',
							'stop-opacity': String(+(Math.min(0.6, a) * s.opacity).toFixed(3)),
						},
						children: [],
					};
				});
				newDefs.push({ type: 'element', name: g.el.name, attributes: { id: shadeId, ...g.geom }, children: stops });
			}
			const overlay = cloneEl(el);
			overlay.attributes.style = '';
			const st = parseStyle(el.attributes.style);
			st.set('fill', `url(#${shadeId})`);
			st.set('stroke', 'none');
			st.set('opacity', 'var(--pc-shade,1)');
			writeStyle(overlay, st);
			delete overlay.attributes.filter;
			delete overlay.attributes.stroke;
			delete overlay.attributes.fill;
			delete overlay.attributes.id;
			addClass(overlay, 'pc-shade');
			const idx = parent.children.indexOf(el);
			parent.children.splice(idx + 1, 0, overlay);
			return;
		}
		const rgb = parseColor(v);
		if (!rgb) {
			setStyle(el, kind, v);
			return;
		}
		setStyle(el, kind, classifyPaint(rgb, kind, anchors, tones));
	};

	// Pass 1: low-opacity neutral overlays → pc-shade (needs inherited fill).
	const visit = (node: XastParent, inheritedFill: string) => {
		for (const c of [...node.children]) {
			if (!isEl(c)) continue;
			if (['defs', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'filter', 'style', 'title', 'desc', 'metadata'].includes(c.name)) continue;
			const fill = prop(c, 'fill') ?? inheritedFill;
			const op = parseFloat(prop(c, 'opacity') ?? prop(c, 'fill-opacity') ?? '1');
			const rgb = parseColor(fill);
			if (op <= 0.6 && rgb && isNeutral(rgb) && (lightness(rgb) > 90 || lightness(rgb) < 12) && !c.children.some(isEl)) {
				addClass(c, 'pc-shade');
				const stroke = prop(c, 'stroke');
				takeProp(c, 'fill');
				takeProp(c, 'opacity');
				takeProp(c, 'fill-opacity');
				setStyle(c, 'fill', toHex(rgb));
				if (!stroke || stroke === 'none') takeProp(c, 'stroke'), setStyle(c, 'stroke', 'none');
				setStyle(c, 'opacity', `calc(${op} * var(--pc-shade,1))`);
				c.attributes['data-shade'] = '1';
				continue;
			}
			visit(c, fill);
		}
	};
	visit(wrapper, wrapper.attributes.fill!);

	// Pass 2: classify all remaining paints.
	walk(
		wrapper,
		(el, parent) => {
			if (el.attributes['data-shade']) {
				delete el.attributes['data-shade'];
				return;
			}
			handlePaint(el, parent, 'fill');
			handlePaint(el, parent, 'stroke');
		},
		NON_RENDER,
	);

	// Drop gradients no longer referenced; add shade defs.
	const refd = new Set<string>(usedAsShade);
	walk(wrapper, (el) => {
		for (const v of Object.values(el.attributes)) for (const m of v.matchAll(/url\(#([^)]+)\)/g)) refd.add(m[1]!);
		const h = hrefOf(el);
		if (h) refd.add(h);
	});
	// Keep referenced gradient href-bases too.
	for (const id of [...refd]) {
		let g = grads.get(id);
		while (g && hrefOf(g.el)) {
			refd.add(hrefOf(g.el)!);
			g = grads.get(hrefOf(g.el)!);
		}
	}
	const prune = (node: XastParent) => {
		node.children = node.children.filter((c) => {
			if (!isEl(c)) return c.type !== 'comment';
			if ((c.name === 'linearGradient' || c.name === 'radialGradient') && !refd.has(c.attributes.id ?? '')) return false;
			prune(c);
			return !(c.name === 'defs' && c.children.length === 0);
		});
	};
	prune(wrapper);
	if (newDefs.length) {
		const defs: XastElement = { type: 'element', name: 'defs', attributes: {}, children: newDefs };
		wrapper.children.unshift(defs);
	}

	// Prefix ids + references.
	const p = opts.idPrefix;
	const rewrite = (v: string) =>
		v.replace(/url\(\s*['"]?#([^'")]+)['"]?\s*\)/g, (_m, id) => `url(#${p}${id})`);
	walk(wrapper, (el) => {
		if (el.attributes.id) el.attributes.id = p + el.attributes.id;
		for (const [k, v] of Object.entries(el.attributes)) {
			if (k === 'href' || k === 'xlink:href') {
				if (v.startsWith('#')) {
					delete el.attributes[k];
					el.attributes.href = `#${p}${v.slice(1)}`;
				}
			} else if (v.includes('url(')) el.attributes[k] = rewrite(v);
		}
		delete el.attributes['data-name'];
	});
	// Wrapper: convert remaining inheritable paint attrs (already styled by walk? wrapper itself not walked).
	handlePaint(wrapper, svg, 'fill');
	handlePaint(wrapper, svg, 'stroke');
}

export function normalizePiece(src: string, opts: NormalizeOptions): NormalizedPiece {
	const result = { viewBox: '0 0 45 45' };
	const plugin: CustomPlugin = {
		name: 'pcRoles',
		fn: (root) => ({
			root: {
				enter: (node) => transform(node, opts, result),
			},
		}),
	};
	const out = optimize(src, {
		multipass: false,
		plugins: [
			{
				name: 'preset-default',
				params: {
					overrides: {
						inlineStyles: { onlyMatchedOnce: false },
						convertColors: { currentColor: false, names2hex: true, rgb2hex: true, shorthex: true, shortname: false },
						mergePaths: false,
					},
				},
			},
			'convertStyleToAttrs',
			'removeDimensions',
			plugin,
		],
	}).data;
	const inner = /<svg[^>]*>([\s\S]*)<\/svg>\s*$/.exec(out)?.[1] ?? '';
	return { viewBox: result.viewBox, body: inner };
}
