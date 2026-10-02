// Where Troy's cork is, and where a worker stands to pin a note on it. No three.js: the walk test uses it.
import { FLOOR } from '../../../shared/layout';
import type { Pt } from '../../../shared/nav';

export const NOTES_BOARD = { x: 15.15, y: 2.05, z: FLOOR.minZ + 0.08, width: 2.2, height: 1.7 };

/** In front of the cork, clear of Troy. */
export const NOTES_STAND: Pt = [NOTES_BOARD.x, FLOOR.minZ + 0.7];
