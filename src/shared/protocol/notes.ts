// Troy's notes, queued for GrokBot. Sent with the floor, and again whenever one arrives.

import type { OfficeNotesState } from '../office-space.js';

export type { OfficeNote, OfficeNotesState } from '../office-space.js';

export type NotesServerMsg =
  | { t: 'notes'; state: OfficeNotesState }
  /** A worker's note was accepted: they get up and pin it on Troy's board. Sent before `notes`. */
  | { t: 'note.stamp'; workerId: string; floorId: string; noteId: string };
