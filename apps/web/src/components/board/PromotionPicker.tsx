import { useEffect, useRef } from 'preact/hooks';
import type { Color, PromotionRole, SquareName } from '@chess/core';
import type { PieceSetAsset } from '@chess/core/theme';
import { PieceGlyph } from './layers/PiecesLayer';
import { squareToCell } from './lib/geometry';
import './PromotionPicker.scss';

const ROLES: PromotionRole[] = ['queen', 'knight', 'rook', 'bishop'];

export interface PromotionPickerProps {
	square: SquareName;
	color: Color;
	orientation: Color;
	pieceSet: PieceSetAsset;
	onPick(role: PromotionRole): void;
	onCancel(): void;
}

/** Column of promotion choices over the target file, growing toward the board centre. */
export function PromotionPicker({ square, color, orientation, pieceSet, onPick, onCancel }: PromotionPickerProps) {
	const first = useRef<HTMLButtonElement>(null);
	const cell = squareToCell(square, orientation);
	const down = cell.y < 4;

	useEffect(() => {
		first.current?.focus({ preventScroll: true });
	}, []);

	return (
		<div
			class="promotion"
			role="dialog"
			aria-label="Choose promotion piece"
			onPointerDown={(e) => {
				e.stopPropagation();
				if (e.target === e.currentTarget) onCancel();
			}}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === 'Escape') onCancel();
			}}
		>
			{ROLES.map((role, i) => {
				const y = down ? cell.y + i : cell.y - i;
				return (
					<button
						key={role}
						ref={i === 0 ? first : undefined}
						type="button"
						class={`promotion__choice board__piece--${color}`}
						style={{ left: `${cell.x * 12.5}%`, top: `${y * 12.5}%` }}
						aria-label={`Promote to ${role}`}
						onClick={() => onPick(role)}
					>
						<PieceGlyph set={pieceSet} color={color} role={role} />
					</button>
				);
			})}
		</div>
	);
}
