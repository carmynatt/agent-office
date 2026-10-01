// OFFICE_NOTE, the note workers send to GrokBot (Troy). Shared by the hook, the board and tests.
// This office never calls Notion; GrokBot is the only writer.

export const NOTE_ACTIONS = ['create', 'update', 'query'] as const;
export type NoteAction = (typeof NOTE_ACTIONS)[number];

export const NOTE_TARGETS = ['notes', 'decisions', 'handoffs'] as const;
export type NoteTarget = (typeof NOTE_TARGETS)[number];

export const NOTE_TYPES = ['decision', 'lore', 'handoff', 'howto', 'status', 'bug'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export type NoteProvider = 'Claude Codex' | 'Cursor' | 'GrokBot';
export type NoteDelivery = 'queued' | 'forwarded';

/** One note on Troy's board, after the office has accepted it. */
export interface OfficeNote {
  id: string;
  at: number;
  action: NoteAction;
  target: NoteTarget;
  title?: string;
  type?: NoteType;
  provider: NoteProvider;
  project?: string;
  tags: string[];
  source_agent: string;
  summary: string;
  body?: string;
  open_questions?: string;
  from?: string;
  to?: string;
  delivery: NoteDelivery;
}

/** What a worker sends, before the office stamps an id and where it went. */
export type OfficeNoteInput = Omit<OfficeNote, 'id' | 'at' | 'delivery'>;

export interface OfficeNotesState {
  notes: OfficeNote[];
  /** GROKBOT_WEBHOOK_URL is set, and it isn't a Notion host. */
  webhook: boolean;
}

const PROVIDERS: Record<string, NoteProvider> = {
  'claude codex': 'Claude Codex',
  claude: 'Claude Codex',
  codex: 'Claude Codex',
  'claude code': 'Claude Codex',
  cursor: 'Cursor',
  grokbot: 'GrokBot',
  troy: 'GrokBot',
};

const FIELD_KEYS = ['action', 'target', 'title', 'type', 'provider', 'project', 'tags', 'source_agent', 'summary', 'body', 'open_questions', 'from', 'to'] as const;

export function noteProvider(value: unknown): NoteProvider | undefined {
  if (typeof value !== 'string') return undefined;
  return PROVIDERS[value.trim().toLowerCase()];
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max) : text;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  return allowed.find((item) => item === text);
}

function tagsOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : [];
  const tags: string[] = [];
  for (const tag of raw) {
    const text = tag.trim().slice(0, 40);
    if (text && !tags.includes(text) && tags.length < 12) tags.push(text);
  }
  return tags;
}

function textFields(text: string): Record<string, string> | undefined {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'OFFICE_NOTE');
  if (start < 0) return undefined;
  const fields: Record<string, string> = {};
  let key = '';
  for (const line of lines.slice(start + 1)) {
    const match = /^([a-z_]+):\s?(.*)$/.exec(line.trim());
    if (match && (FIELD_KEYS as readonly string[]).includes(match[1])) {
      key = match[1];
      fields[key] = match[2].trim();
    } else if (key && line.trim()) {
      fields[key] = `${fields[key]}\n${line.trim()}`;
    }
  }
  return fields;
}

function fieldsOf(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === 'string') return textFields(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record.text === 'string' && record.text.includes('OFFICE_NOTE')) return textFields(record.text);
  if (typeof record.note === 'string' && record.note.includes('OFFICE_NOTE')) return textFields(record.note);
  return record;
}

function party(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return noteProvider(value);
}

/** Parses an OFFICE_NOTE block or a JSON object. `sourceFallback` fills source_agent when the worker's name is known. */
export function parseOfficeNote(raw: unknown, sourceFallback?: string): { note: OfficeNoteInput } | { error: string } {
  const fields = fieldsOf(raw);
  if (!fields) return { error: 'Send OFFICE_NOTE text or a JSON object' };
  const action = oneOf(fields.action, NOTE_ACTIONS);
  if (!action) return { error: 'action is create, update or query' };
  const target = oneOf(fields.target, NOTE_TARGETS);
  if (!target) return { error: 'target is notes, decisions or handoffs' };
  const provider = noteProvider(fields.provider);
  if (provider !== 'Claude Codex' && provider !== 'Cursor') return { error: 'provider is Claude Codex or Cursor' };
  const source_agent = clip(fields.source_agent, 80) ?? clip(sourceFallback, 80);
  if (!source_agent) return { error: 'source_agent is required' };
  const summary = clip(fields.summary, 1000);
  if (!summary) return { error: 'summary is required' };
  const title = clip(fields.title, 200);
  const type = oneOf(fields.type, NOTE_TYPES);
  if (action !== 'query') {
    if (!title) return { error: 'title is required' };
    if (!type) return { error: 'type is decision, lore, handoff, howto, status or bug' };
  }
  const from = party(fields.from);
  const to = party(fields.to);
  if (fields.from !== undefined && fields.from !== '' && !from) return { error: 'from is Claude Codex, Cursor or GrokBot' };
  if (fields.to !== undefined && fields.to !== '' && !to) return { error: 'to is Claude Codex, Cursor or GrokBot' };
  if (target === 'handoffs' && action !== 'query' && (!from || !to)) return { error: 'handoffs need from and to' };
  const project = clip(fields.project, 80);
  const body = clip(fields.body, 8000);
  const open_questions = clip(fields.open_questions, 1000);
  return {
    note: {
      action,
      target,
      provider,
      tags: tagsOf(fields.tags),
      source_agent,
      summary,
      ...(title ? { title } : {}),
      ...(type ? { type } : {}),
      ...(project ? { project } : {}),
      ...(body ? { body } : {}),
      ...(open_questions ? { open_questions } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  };
}

/** The OFFICE_NOTE block GrokBot reads, one field a line. */
export function formatOfficeNote(note: OfficeNoteInput): string {
  const lines = ['OFFICE_NOTE'];
  for (const key of FIELD_KEYS) {
    const value = note[key];
    if (value === undefined || value === '') continue;
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    const [first, ...rest] = text.split('\n');
    lines.push(`${key}: ${first}`);
    lines.push(...rest);
  }
  return lines.join('\n');
}

/** True when a URL would be Notion. This process does not call those hosts. */
export function isNotionUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'api.notion.com' || host === 'notion.so' || host.endsWith('.notion.so') || host === 'notion.com' || host.endsWith('.notion.com');
  } catch {
    return false;
  }
}
