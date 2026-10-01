// Troy's note queue. Notes are appended to .office-space/notes.jsonl. When GROKBOT_WEBHOOK_URL is
// set to something other than Notion, the same note is posted there. This process never calls Notion.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { formatOfficeNote, isNotionUrl, parseOfficeNote, type NoteDelivery, type OfficeNote, type OfficeNoteInput, type OfficeNotesState } from '../../shared/office-space.js';

const MAX_NOTES = 200;
const MAX_FILE = 2 * 1024 * 1024;

export interface NoteFetch {
  (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<{ ok: boolean; status: number }>;
}

export function notesFile(dataDir: string): string {
  const home = path.basename(dataDir) === '.agent-office' ? path.dirname(dataDir) : dataDir;
  return path.join(home, '.office-space', 'notes.jsonl');
}

/** A webhook this office will call. A Notion URL is treated as unset. */
export function grokbotWebhook(env: NodeJS.ProcessEnv): string | undefined {
  const url = env.GROKBOT_WEBHOOK_URL?.trim();
  if (!url || isNotionUrl(url)) return undefined;
  return url;
}

/**
 * Sender key for the GrokBot webhook, sent as `Authorization: Bearer`.
 * `GROKBOT_WEBHOOK_SECRET` wins when both it and `GROKBOT_WEBHOOK_TOKEN` are set.
 */
export function grokbotWebhookSecret(env: NodeJS.ProcessEnv): string | undefined {
  const secret = env.GROKBOT_WEBHOOK_SECRET?.trim() || env.GROKBOT_WEBHOOK_TOKEN?.trim();
  return secret || undefined;
}

function webhookHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = grokbotWebhookSecret(env);
  if (secret) headers.authorization = `Bearer ${secret}`;
  return headers;
}

export class NoteQueue {
  readonly notes: OfficeNote[] = [];

  constructor(
    private file: string,
    private env: NodeJS.ProcessEnv,
    private fetchImpl: NoteFetch,
    private onChange: () => void,
  ) {}

  load() {
    if (!existsSync(this.file)) return;
    let text = '';
    try {
      const buf = readFileSync(this.file);
      text = (buf.length > MAX_FILE ? buf.subarray(buf.length - MAX_FILE) : buf).toString('utf8');
    } catch {
      return;
    }
    const parsed: OfficeNote[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const note = JSON.parse(line) as OfficeNote;
        if (note && typeof note.id === 'string' && typeof note.summary === 'string') parsed.push(note);
      } catch {
        // a torn line at the start of a tail read
      }
    }
    this.notes.splice(0, this.notes.length, ...parsed.slice(-MAX_NOTES));
  }

  state(): OfficeNotesState {
    return { notes: this.notes, webhook: !!grokbotWebhook(this.env) };
  }

  async submit(raw: unknown, sourceFallback?: string): Promise<{ note: OfficeNote } | { error: string }> {
    const parsed = parseOfficeNote(raw, sourceFallback);
    if ('error' in parsed) return parsed;
    const delivery = await this.forward(parsed.note);
    const note: OfficeNote = { ...parsed.note, id: randomBytes(6).toString('hex'), at: Date.now(), delivery };
    this.notes.push(note);
    if (this.notes.length > MAX_NOTES) this.notes.splice(0, this.notes.length - MAX_NOTES);
    try {
      mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      appendFileSync(this.file, `${JSON.stringify(note)}\n`, { mode: 0o600 });
    } catch {
      // the board still has it for this run
    }
    this.onChange();
    return { note };
  }

  private async forward(note: OfficeNoteInput): Promise<NoteDelivery> {
    const url = grokbotWebhook(this.env);
    if (!url) return 'queued';
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: webhookHeaders(this.env),
        body: JSON.stringify({ format: 'OFFICE_NOTE', text: formatOfficeNote(note), note }),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok ? 'forwarded' : 'queued';
    } catch {
      return 'queued';
    }
  }
}

let active: NoteQueue | undefined;

export function noteQueue(): NoteQueue | undefined {
  return active;
}

/** Opens the office's queue and keeps it for the hook and the board. */
export function openNoteQueue(dataDir: string, env: NodeJS.ProcessEnv, fetchImpl: NoteFetch, onChange: () => void): NoteQueue {
  const queue = new NoteQueue(notesFile(dataDir), env, fetchImpl, onChange);
  queue.load();
  active = queue;
  return queue;
}
