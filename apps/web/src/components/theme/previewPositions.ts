// Sample positions for theme previews.
import type { SquareName } from '@chess/core/chess';

/** Italian-ish middlegame with a check on the white king — shows pieces, last move and check highlights. */
export const PREVIEW_FEN = 'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2bPP/RNBQK2R w KQkq - 0 5';
export const PREVIEW_LAST_MOVE: [SquareName, SquareName] = ['c5', 'f2'];
export const PREVIEW_CHECK: SquareName = 'e1';
/** Opening position for gallery thumbnails. */
export const THUMB_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
export const THUMB_LAST_MOVE: [SquareName, SquareName] = ['f1', 'c4'];
