// Load a piece sprite (once per set) and re-render when it arrives.
import { useEffect, useState } from 'preact/hooks';
import type { PieceSetAsset } from '@chess/core/theme';
import { isSpriteLoaded, loadPieceSprite } from '@/components/board';

export function useSprite(set: Pick<PieceSetAsset, 'id' | 'sprite'> | undefined): boolean {
	const [, setTick] = useState(0);
	const loaded = !!set && isSpriteLoaded(set.id);
	useEffect(() => {
		if (!set || isSpriteLoaded(set.id)) return;
		let alive = true;
		loadPieceSprite(set).then(
			() => alive && setTick((n) => n + 1),
			() => {},
		);
		return () => {
			alive = false;
		};
	}, [set?.id]);
	return loaded;
}
