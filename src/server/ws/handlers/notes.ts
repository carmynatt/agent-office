// Troy's board: the notes queued for GrokBot, the same list on every floor.
import type { OfficeNotesState } from '../../../shared/protocol.js';
import { noteQueue } from '../../office-space/queue.js';

export function notesView(): OfficeNotesState {
  return noteQueue()?.state() ?? { notes: [], webhook: false };
}
