import type { OfficeNotesState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Notes queued for Troy (GrokBot). The same list on every floor. */
    notes: OfficeNotesState;
  }
  interface Topics {
    notes: true;
  }
}

export const notes: Slice = {
  init(s) {
    s.notes = { notes: [], webhook: false };
  },
  on: {
    notes(s, m) {
      s.notes = m.state;
      return ['notes'];
    },
  },
  enter(s, v) {
    s.notes = v.notes ?? { notes: [], webhook: false };
    return ['notes'];
  },
};
