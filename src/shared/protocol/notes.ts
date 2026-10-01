// Troy's notes, queued for GrokBot. Sent with the floor, and again whenever one arrives.

import type { OfficeNotesState } from '../office-space.js';

export type { OfficeNote, OfficeNotesState } from '../office-space.js';

export type NotesServerMsg = { t: 'notes'; state: OfficeNotesState };
