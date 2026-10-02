import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commandNames, configuredProvider, workerCommand } from '../src/server/agents.js';
import { NoteQueue, grokbotWebhook, grokbotWebhookSecret, notesFile } from '../src/server/office-space/queue.js';
import { formatOfficeNote, isNotionUrl, parseOfficeNote } from '../src/shared/office-space.js';
import { plainLook } from '../src/shared/avatar.js';
import { keepOfficePlayerPlain } from '../src/client/features/office-player/index.js';
import { TROY_COLOR, wardrobeColor } from '../src/shared/providers.js';
import { buildRequest, handleMcp, parseArgs } from '../bin/office-notes.js';

const LORE = `OFFICE_NOTE
action: create
target: notes
title: Worktrees required
type: lore
provider: Cursor
project: Office Space
tags: office, infra
source_agent: cursor-desk-1
summary: Each hired worker gets its own git worktree.
`;

test('the player starts as a plain office person and ignores a holiday costume', () => {
  assert.deepEqual(plainLook(), { skin: 2, hair: 1, style: 0 });
  const worn: (string | null)[] = [];
  const avatar = {
    setCostume(theme: 'halloween' | 'christmas' | null) {
      worn.push(theme);
    },
  };
  keepOfficePlayerPlain(avatar);
  avatar.setCostume('halloween');
  avatar.setCostume('christmas');
  assert.deepEqual(worn, [null, null]);
});

test('wardrobe colors are the provider shirts, and other providers stay unset', () => {
  assert.equal(wardrobeColor('agent', 'claude'), '#FF8A5B');
  assert.equal(wardrobeColor('agent', 'codex'), '#FF8A5B');
  assert.equal(wardrobeColor('agent', 'cursor'), '#7C6AF7');
  assert.equal(wardrobeColor('shell', 'claude'), TROY_COLOR);
  assert.equal(wardrobeColor('agent', 'claude', '#ef476f'), '#ef476f');
  assert.equal(wardrobeColor('agent', 'opencode'), undefined);
  assert.equal(wardrobeColor('agent', 'pi'), undefined);
});

test('Cursor is hired as cursor-agent, then agent', () => {
  assert.equal(configuredProvider('cursor-agent'), 'cursor');
  assert.equal(configuredProvider('/opt/bin/agent'), 'cursor');
  assert.equal(configuredProvider('cursor'), 'cursor');
  assert.equal(configuredProvider('my-agent'), 'custom');
  assert.deepEqual(commandNames('cursor'), ['cursor-agent', 'agent']);
  assert.deepEqual(commandNames('codex'), ['codex']);
  assert.deepEqual(commandNames('claude'), ['claude']);
  const tried: string[] = [];
  const found = workerCommand('cursor', 'claude', 'claude', (bin) => {
    tried.push(bin);
    return bin === 'agent' ? '/usr/local/bin/agent' : null;
  });
  assert.deepEqual(tried, ['cursor-agent', 'agent']);
  assert.equal(found, 'agent');
  assert.equal(workerCommand('cursor', 'claude', 'claude', (bin) => (bin === 'cursor-agent' ? '/bin/cursor-agent' : null)), 'cursor-agent');
  assert.equal(workerCommand('codex', 'claude', 'claude', (bin) => (bin === 'codex' ? '/bin/codex' : null)), 'codex');
  let looked = false;
  assert.equal(
    workerCommand('claude', 'claude', '/usr/bin/claude', () => {
      looked = true;
      return null;
    }),
    '/usr/bin/claude',
  );
  assert.equal(looked, false);
  assert.equal(workerCommand('cursor', 'cursor', 'cursor', (bin) => (bin === 'cursor-agent' ? '/bin/cursor-agent' : null)), 'cursor-agent');
});

test('OFFICE_NOTE text and JSON parse, and queries stay short', () => {
  const parsed = parseOfficeNote(LORE);
  assert.ok(!('error' in parsed));
  if ('error' in parsed) return;
  assert.equal(parsed.note.provider, 'Cursor');
  assert.equal(parsed.note.type, 'lore');
  assert.deepEqual(parsed.note.tags, ['office', 'infra']);
  assert.match(formatOfficeNote(parsed.note), /^OFFICE_NOTE\naction: create/);
  const json = parseOfficeNote({ action: 'query', target: 'notes', provider: 'claude', source_agent: 'codex-1', summary: 'What colors?' });
  assert.ok(!('error' in json));
  if ('error' in json) return;
  assert.equal(json.note.provider, 'Claude Codex');
  assert.equal(parseOfficeNote({ action: 'create', target: 'notes', provider: 'Cursor', summary: 'x' }).error, 'source_agent is required');
  const withName = parseOfficeNote({ action: 'query', target: 'notes', provider: 'Cursor', summary: 'colors?' }, 'Ada');
  assert.ok(!('error' in withName) && withName.note.source_agent === 'Ada');
  assert.match(parseOfficeNote({ action: 'create', target: 'handoffs', title: 'H', type: 'handoff', provider: 'Cursor', source_agent: 'a', summary: 's' }).error ?? '', /from and to/);
});

test('an unset webhook queues notes locally and never calls out', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-notes-'));
  const dataDir = path.join(dir, '.agent-office');
  let calls = 0;
  const queue = new NoteQueue(notesFile(dataDir), {}, async () => {
    calls += 1;
    return { ok: true, status: 200 };
  }, () => {});
  const result = await queue.submit(LORE);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.note.delivery, 'queued');
  assert.equal(calls, 0);
  assert.equal(queue.state().webhook, false);
  const lines = readFileSync(notesFile(dataDir), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).title, 'Worktrees required');
  rmSync(dir, { recursive: true, force: true });
});

test('GROKBOT_WEBHOOK_URL forwards the note, and a Notion URL is not called', async () => {
  assert.equal(isNotionUrl('https://api.notion.com/v1/pages'), true);
  assert.equal(grokbotWebhook({ GROKBOT_WEBHOOK_URL: 'https://api.notion.com/v1/pages' }), undefined);
  const dir = mkdtempSync(path.join(tmpdir(), 'office-notes-'));
  const seen: string[] = [];
  const queue = new NoteQueue(
    notesFile(path.join(dir, '.agent-office')),
    { GROKBOT_WEBHOOK_URL: 'https://grokbot.example/hook' },
    async (url, init) => {
      seen.push(url, init.body);
      assert.equal(init.headers.authorization, undefined);
      return { ok: true, status: 202 };
    },
    () => {},
  );
  const result = await queue.submit({ action: 'query', target: 'notes', provider: 'Cursor', source_agent: 'c', summary: 'colors?' });
  assert.ok(!('error' in result) && result.note.delivery === 'forwarded');
  assert.equal(seen[0], 'https://grokbot.example/hook');
  assert.match(seen[1], /OFFICE_NOTE/);
  assert.doesNotMatch(seen[1], /notion/i);
  assert.equal(queue.state().webhook, true);
  rmSync(dir, { recursive: true, force: true });
});

test('GROKBOT_WEBHOOK_SECRET is sent as Authorization: Bearer, and a Notion URL is still not called', async () => {
  assert.equal(grokbotWebhookSecret({}), undefined);
  assert.equal(grokbotWebhookSecret({ GROKBOT_WEBHOOK_TOKEN: ' tok ' }), 'tok');
  assert.equal(grokbotWebhookSecret({ GROKBOT_WEBHOOK_SECRET: 'sec', GROKBOT_WEBHOOK_TOKEN: 'tok' }), 'sec');
  const dir = mkdtempSync(path.join(tmpdir(), 'office-notes-'));
  const seen: { url: string; authorization?: string; body: string }[] = [];
  const queue = new NoteQueue(
    notesFile(path.join(dir, '.agent-office')),
    { GROKBOT_WEBHOOK_URL: 'https://grokbot.example/hook', GROKBOT_WEBHOOK_TOKEN: 'desk-key' },
    async (url, init) => {
      seen.push({ url, authorization: init.headers.authorization, body: init.body });
      return { ok: true, status: 200 };
    },
    () => {},
  );
  const result = await queue.submit(LORE);
  assert.ok(!('error' in result) && result.note.delivery === 'forwarded');
  assert.equal(seen[0].authorization, 'Bearer desk-key');
  assert.doesNotMatch(seen[0].body, /desk-key/);
  let notionCalls = 0;
  const held = new NoteQueue(
    notesFile(path.join(dir, 'held', '.agent-office')),
    { GROKBOT_WEBHOOK_URL: 'https://api.notion.com/v1/pages', GROKBOT_WEBHOOK_SECRET: 'sec' },
    async () => {
      notionCalls += 1;
      return { ok: true, status: 200 };
    },
    () => {},
  );
  const queued = await held.submit(LORE);
  assert.ok(!('error' in queued) && queued.note.delivery === 'queued');
  assert.equal(notionCalls, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('office-notes posts to /hooks/notes and speaks one MCP tool', async () => {
  const req = buildRequest({ url: 'http://127.0.0.1:9', worker: 'w1', token: 'tok' }, LORE);
  assert.equal(req.url, 'http://127.0.0.1:9/hooks/notes?worker=w1');
  assert.equal(req.headers.authorization, 'Bearer tok');
  assert.equal(req.headers['content-type'].startsWith('text/plain'), true);
  assert.equal(parseArgs(['--help']).cmd, 'help');
  const listed = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { env: {}, fetch });
  assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), ['submit_office_note']);
  const init = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { env: {}, fetch });
  assert.match(init.result.instructions, /Do not call Notion/);
});
