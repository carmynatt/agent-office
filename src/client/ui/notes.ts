import './notes.css';
import type { OfficeNote } from '../../shared/protocol';
import { TROY_COLOR } from '../../shared/providers';
import { store } from '../state';
import { h, openModal, timeAgo } from './dom';

const CHIP: Record<string, string> = {
  'Claude Codex': '#FF8A5B',
  Cursor: '#7C6AF7',
  GrokBot: TROY_COLOR,
};

function chip(text: string, color: string) {
  return h('span.note-chip', { style: `background:${color}` }, text);
}

function card(note: OfficeNote) {
  const when = timeAgo(note.at);
  const where = note.delivery === 'forwarded' ? 'sent to GrokBot' : 'queued for Troy';
  return h(
    'article.note-card',
    {},
    h(
      'header',
      {},
      chip(note.provider, CHIP[note.provider] ?? TROY_COLOR),
      note.type ? chip(note.type, '#fff7b0') : null,
      chip(where, note.delivery === 'forwarded' ? '#caffbf' : '#d6dbe4'),
      h('h3', {}, note.title || note.summary),
    ),
    h('p', {}, note.summary),
    note.body ? h('p.note-meta', {}, note.body) : null,
    h('p.note-meta', {}, [note.source_agent, note.target, note.tags.join(', '), when].filter(Boolean).join(' · ')),
  );
}

/** Troy's board, as a window: the notes workers queued for GrokBot. */
export function openNotes() {
  const state = store.notes;
  const status = state.webhook
    ? 'GROKBOT_WEBHOOK_URL is set, so new notes are also posted to GrokBot. The board keeps a copy.'
    : 'GROKBOT_WEBHOOK_URL is unset, so notes stay in .office-space/notes.jsonl until Troy picks them up.';
  const list = state.notes.length
    ? h('div.notes-list', {}, ...[...state.notes].reverse().map(card))
    : h('p.notes-empty', {}, 'No notes yet. A worker sends OFFICE_NOTE with office-notes, or POST /hooks/notes. GrokBot is the one who writes Notion.');
  const el = h('div.modal.notes', { role: 'dialog', 'aria-label': "Troy's notes" }, h('header', {}, h('h2', {}, 'Troy · notes'), h('p.note-status', {}, status)), h('div.body', {}, list));
  openModal(el, { doing: "reading Troy's notes" });
}
