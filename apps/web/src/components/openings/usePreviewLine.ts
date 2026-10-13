// Local, throw-away preview of an opening line (never touches the sessions store).
//   const p = usePreviewLine(entry);   // p.session (cursor at p.ply), p.setPly, p.step
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ROOT_ID, mainline } from '@chess/core/chess';
import { sessionFromOpening, type Session } from '@chess/core/game';
import type { OpeningEntry } from '@chess/core/openings';

export interface PreviewLine {
	session: Session | null;
	ply: number;
	plies: number;
	setPly: (ply: number) => void;
	step: (delta: number) => void;
	/** Node id → ply (for MoveList goto). */
	plyOf: (nodeId: string) => number;
}

/** Ply defaults to the end of the line; resets whenever the opening changes. */
export function usePreviewLine(entry: OpeningEntry | null | undefined, initialPly?: number): PreviewLine {
	const base = useMemo(() => (entry ? sessionFromOpening(entry, { id: `preview-${entry.id}`, now: 0 }) : null), [entry]);
	const nodes = useMemo(() => (base ? mainline(base.tree) : []), [base]);
	const plies = nodes.length;
	const [ply, setPlyRaw] = useState(initialPly ?? plies);

	useEffect(() => setPlyRaw(initialPly ?? plies), [base]);

	const clamped = Math.max(0, Math.min(ply, plies));
	const session = useMemo(() => (base ? { ...base, cursor: clamped === 0 ? ROOT_ID : nodes[clamped - 1]!.id } : null), [base, nodes, clamped]);
	const setPly = (p: number) => setPlyRaw(Math.max(0, Math.min(p, plies)));
	return {
		session,
		ply: clamped,
		plies,
		setPly,
		step: (d) => setPly(clamped + d),
		plyOf: (id) => (id === ROOT_ID ? 0 : nodes.findIndex((n) => n.id === id) + 1),
	};
}
