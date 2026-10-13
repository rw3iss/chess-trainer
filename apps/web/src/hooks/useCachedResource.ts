// Stale-while-revalidate resource hook over services/cache.
//   const { data, loading, error, refresh } = useCachedResource(`explorer:${fen}`, () => api.explorer(fen), 7 * DAY);
// Renders cached data immediately, revalidates stale entries in the background.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { dataCache } from '@/services/cache';

export interface CachedResource<T> {
	data: T | undefined;
	loading: boolean;
	error: Error | null;
	refresh: () => void;
}

export function useCachedResource<T>(key: string | null, loader: () => Promise<T>, ttlMs?: number): CachedResource<T> {
	const [data, setData] = useState<T | undefined>(undefined);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const loaderRef = useRef(loader);
	loaderRef.current = loader;
	const [nonce, setNonce] = useState(0);

	useEffect(() => {
		if (!key) {
			setData(undefined);
			return;
		}
		let alive = true;
		setLoading(true);
		setError(null);
		void (async () => {
			const cached = nonce === 0 ? await dataCache.peek<T>(key) : undefined;
			if (!alive) return;
			if (cached) setData(cached.value);
			if (cached && !cached.stale) {
				setLoading(false);
				return;
			}
			try {
				const value = await dataCache.load(key, () => loaderRef.current(), ttlMs);
				if (alive) setData(value);
			} catch (e) {
				if (alive) setError(e instanceof Error ? e : new Error(String(e)));
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [key, ttlMs, nonce]);

	const refresh = useCallback(() => setNonce((n) => n + 1), []);
	return { data, loading, error, refresh };
}
