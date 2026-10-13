// Shared roving-focus key handling for tablists / radiogroups.
// Returns the next index for a key, or null if the key is not handled.

export function nextRovingIndex(key: string, current: number, count: number, orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal'): number | null {
	if (count === 0) return null;
	const prevKeys = orientation === 'vertical' ? ['ArrowUp'] : orientation === 'both' ? ['ArrowLeft', 'ArrowUp'] : ['ArrowLeft'];
	const nextKeys = orientation === 'vertical' ? ['ArrowDown'] : orientation === 'both' ? ['ArrowRight', 'ArrowDown'] : ['ArrowRight'];
	if (nextKeys.includes(key)) return (current + 1) % count;
	if (prevKeys.includes(key)) return (current - 1 + count) % count;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	return null;
}
