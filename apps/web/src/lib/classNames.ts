// Tiny class-name joiner: cx('btn', isActive && 'btn--active', { 'btn--block': block }).

type ClassValue = string | false | null | undefined | 0 | Record<string, boolean | undefined | null>;

export function cx(...values: ClassValue[]): string {
	const out: string[] = [];
	for (const v of values) {
		if (!v) continue;
		if (typeof v === 'string') out.push(v);
		else for (const [k, on] of Object.entries(v)) if (on) out.push(k);
	}
	return out.join(' ');
}
