// POST /hooks/notes: a worker sends OFFICE_NOTE to Troy. Loopback only, same token as the other hooks.
import type http from 'node:http';
import { isNotionUrl } from '../../shared/office-space.js';
import type { Ctx } from '../office/context.js';
import { readBody, send } from '../http/util.js';
import { noteQueue } from '../office-space/queue.js';

export async function officeNotes(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST an OFFICE_NOTE' });
  const workerId = url.searchParams.get('worker') ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const floor = ctx.workerFloor(workerId);
  const agent = floor?.workers.authenticate(workerId, token);
  if (!floor || !agent) return send(res, 401, { error: 'Send your own AGENT_OFFICE_WORKER_ID as ?worker= and AGENT_OFFICE_HOOK_TOKEN as the bearer token' });
  const queue = noteQueue();
  if (!queue) return send(res, 503, { error: 'The notes queue is not up' });
  let raw: unknown;
  try {
    const body = await readBody(req);
    const text = body.trim();
    raw = text.startsWith('OFFICE_NOTE') || (req.headers['content-type'] ?? '').includes('text/plain') ? text : text ? JSON.parse(text) : {};
  } catch {
    return send(res, 400, { error: 'Send OFFICE_NOTE text or JSON' });
  }
  const result = await queue.submit(raw, agent.name, { notify: false });
  if ('error' in result) return send(res, 400, { error: result.error });
  // The trip first, then the board, so the cork waits until they pin it.
  ctx.broadcast({ t: 'note.stamp', workerId, floorId: floor.id, noteId: result.note.id });
  ctx.broadcast({ t: 'notes', state: queue.state() });
  const webhook = process.env.GROKBOT_WEBHOOK_URL?.trim();
  const held = webhook && isNotionUrl(webhook) ? 'Notion URLs are not called from this office; the note is queued for Troy' : undefined;
  send(res, 200, { ok: true, delivery: result.note.delivery, ...(held ? { held } : {}), note: result.note });
}
