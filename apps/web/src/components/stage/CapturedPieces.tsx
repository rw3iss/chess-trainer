// Captured pieces for one player strip: the opponent pieces this side has taken, grouped by
// role (same pieces overlap), plus the material lead ("+3"). Uses the active piece set + colours.
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { capturedPieces, type Color, type Role } from '@chess/core/chess';
import { pieceThemeCssVars, type PieceSetAsset, type PieceTheme } from '@chess/core/theme';
import { pieceSymbolHref } from '@/components/board';
import './CapturedPieces.scss';

interface CapturedPiecesProps {
	fen: string;
	/** Side whose captures are shown (the pieces drawn are the other colour). */
	color: Color;
	pieceSet: PieceSetAsset;
	pieceTheme: PieceTheme;
}

const ROLE_NAMES: Record<Role, string> = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen', king: 'king' };

function groupRoles(roles: Role[]): Array<[Role, number]> {
	const out: Array<[Role, number]> = [];
	for (const r of roles) {
		const last = out[out.length - 1];
		if (last && last[0] === r) last[1]++;
		else out.push([r, 1]);
	}
	return out;
}

export function CapturedPieces({ fen, color, pieceSet, pieceTheme }: CapturedPiecesProps): JSX.Element | null {
	const { captured, advantage } = useMemo(() => capturedPieces(fen), [fen]);
	const roles = captured[color];
	const lead = advantage[color];
	if (!roles.length && !lead) return null;
	const victim: Color = color === 'white' ? 'black' : 'white';
	const style = pieceThemeCssVars(pieceTheme) as JSX.CSSProperties;
	const label = roles.length
		? `Captured: ${groupRoles(roles).map(([r, n]) => `${n} ${ROLE_NAMES[r]}${n > 1 ? 's' : ''}`).join(', ')}`
		: 'No captures';
	return (
		<span class="captured" style={style} aria-label={lead ? `${label}. Material +${lead}` : label} role="img">
			{groupRoles(roles).map(([role, n]) => (
				<span key={role} class="captured__group">
					{Array.from({ length: n }, (_, i) => (
						<svg key={i} class={`captured__piece captured__piece--${victim}`} viewBox={pieceSet.viewBox} aria-hidden="true" focusable="false">
							<use href={pieceSymbolHref(pieceSet, victim, role)} />
						</svg>
					))}
				</span>
			))}
			{lead > 0 && <span class="captured__lead">+{lead}</span>}
		</span>
	);
}
