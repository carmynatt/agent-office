#!/usr/bin/env node
// office-notes: send an OFFICE_NOTE to Troy (GrokBot) from a worker's terminal. The office puts it
// on PATH with AGENT_OFFICE_HOOK_URL, AGENT_OFFICE_WORKER_ID and AGENT_OFFICE_HOOK_TOKEN. It posts
// to POST /hooks/notes. `office-notes mcp` is the same tool on stdio. This command never calls Notion.

import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage:
  office-notes <<'EOF'                         send an OFFICE_NOTE block on stdin
  OFFICE_NOTE
  action: create
  …
  EOF
  office-notes --action create --target notes --title "…" --type lore \\
      --provider Cursor --summary "…" [--source-agent name] [--body "…"]
  office-notes mcp                             one MCP tool, submit_office_note, on stdio

Workers send notes here. GrokBot writes Notion. This command does not.`;

const ENV = ['AGENT_OFFICE_HOOK_URL', 'AGENT_OFFICE_WORKER_ID', 'AGENT_OFFICE_HOOK_TOKEN'];
const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export class UsageError extends Error {}

const TOOL = {
  name: 'submit_office_note',
  title: 'Send a note to Troy',
  description:
    'Sends an OFFICE_NOTE to Troy (GrokBot), the only writer for the Office Space Notion workspace. ' +
    'Do not call the Notion API yourself. action is create, update or query. target is notes, decisions or handoffs. ' +
    'provider is "Claude Codex" or "Cursor". A query puts the question in summary and does not write.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'query'] },
      target: { type: 'string', enum: ['notes', 'decisions', 'handoffs'] },
      title: { type: 'string' },
      type: { type: 'string', enum: ['decision', 'lore', 'handoff', 'howto', 'status', 'bug'] },
      provider: { type: 'string', enum: ['Claude Codex', 'Cursor'] },
      project: { type: 'string' },
      tags: { type: 'string', description: 'Comma-separated tags.' },
      source_agent: { type: 'string' },
      summary: { type: 'string' },
      body: { type: 'string' },
      open_questions: { type: 'string' },
      from: { type: 'string', enum: ['Claude Codex', 'Cursor', 'GrokBot'] },
      to: { type: 'string', enum: ['Claude Codex', 'Cursor', 'GrokBot'] },
    },
    required: ['action', 'target', 'provider', 'summary'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, openWorldHint: false },
};

function options(args) {
  const valued = ['--action', '--target', '--title', '--type', '--provider', '--project', '--tags', '--source-agent', '--summary', '--body', '--open-questions', '--from', '--to'];
  /** @type {Record<string, string>} */
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') return { help: true, opts };
    if (!valued.includes(arg)) throw new UsageError(`Unknown option: ${arg}`);
    const value = args[++i];
    if (value === undefined) throw new UsageError(`${arg} needs a value`);
    opts[arg] = value;
  }
  return { help: false, opts };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === 'help' || cmd === '-h' || cmd === '--help') return { cmd: 'help' };
  if (cmd === 'mcp') {
    if (rest.length) throw new UsageError('mcp takes no arguments');
    return { cmd: 'mcp' };
  }
  if (cmd === 'send' || cmd.startsWith('--')) {
    const args = cmd === 'send' ? rest : argv;
    const { help, opts } = options(args);
    if (help) return { cmd: 'help' };
    return { cmd: 'send', opts };
  }
  throw new UsageError(`Unknown command: ${cmd}`);
}

/** @param {Record<string, string | undefined>} env */
export function officeEnv(env) {
  const missing = ENV.filter((key) => !env[key]);
  if (missing.length) throw new Error(`${missing.join(', ')} ${missing.length === 1 ? "isn't" : "aren't"} set. office-notes runs inside a worker's terminal.`);
  return { url: env.AGENT_OFFICE_HOOK_URL.replace(/\/+$/, ''), worker: env.AGENT_OFFICE_WORKER_ID, token: env.AGENT_OFFICE_HOOK_TOKEN };
}

/** @param {{ url: string, worker: string, token: string }} office @param {string | Record<string, unknown>} body */
export function buildRequest(office, body) {
  const endpoint = new URL(`${office.url}/hooks/notes`);
  endpoint.searchParams.set('worker', office.worker);
  const text = typeof body === 'string';
  return {
    method: 'POST',
    url: endpoint.href,
    headers: { authorization: `Bearer ${office.token}`, 'content-type': text ? 'text/plain; charset=utf-8' : 'application/json' },
    body: text ? body : JSON.stringify(body),
  };
}

function flagNote(opts, source) {
  /** @type {Record<string, string>} */
  const note = {};
  const map = {
    '--action': 'action',
    '--target': 'target',
    '--title': 'title',
    '--type': 'type',
    '--provider': 'provider',
    '--project': 'project',
    '--tags': 'tags',
    '--source-agent': 'source_agent',
    '--summary': 'summary',
    '--body': 'body',
    '--open-questions': 'open_questions',
    '--from': 'from',
    '--to': 'to',
  };
  for (const [flag, key] of Object.entries(map)) if (opts[flag] !== undefined) note[key] = opts[flag];
  if (!note.source_agent && source) note.source_agent = source;
  return note;
}

async function post(body, io) {
  const req = buildRequest(officeEnv(io.env), body);
  const res = await io.fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text.slice(0, 300) };
  }
  if (res.status < 200 || res.status >= 300) throw new Error(parsed.error || `The office said no (${res.status}).`);
  return parsed;
}

function readStdin(stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => (data += chunk));
    stdin.on('end', () => resolve(data));
    stdin.on('error', reject);
  });
}

/** @param {any} msg @param {{ env: Record<string, string | undefined>, fetch: typeof fetch }} io */
export async function handleMcp(msg, io) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  }
  if (!('id' in msg)) return undefined;
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  if (msg.method === 'initialize') {
    const asked = msg.params?.protocolVersion;
    return ok({
      protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'office-notes', title: 'Office Space notes', version: '1.0.0' },
      instructions: 'Send OFFICE_NOTE requests to Troy with submit_office_note. Do not call Notion. GrokBot is the only Notion writer.',
    });
  }
  if (msg.method === 'ping') return ok({});
  if (msg.method === 'tools/list') return ok({ tools: [TOOL] });
  if (msg.method === 'tools/call') {
    if (msg.params?.name !== TOOL.name) return { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: `Unknown tool: ${msg.params?.name}` } };
    try {
      const args = msg.params.arguments ?? {};
      if (!args.source_agent && io.env.AGENT_OFFICE_WORKER_ID) args.source_agent = io.env.AGENT_OFFICE_WORKER_ID;
      const answer = await post(args, io);
      const delivery = answer.delivery === 'forwarded' ? 'Forwarded to GrokBot.' : 'Queued locally for Troy.';
      return ok({ content: [{ type: 'text', text: `${delivery}\n${JSON.stringify(answer.note ?? answer, null, 1)}` }] });
    } catch (err) {
      return ok({ content: [{ type: 'text', text: err.message }], isError: true });
    }
  }
  return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
}

function serveMcp(io, stdin, stdout) {
  return new Promise((resolve) => {
    const lines = createInterface({ input: stdin, crlfDelay: Infinity });
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
        return;
      }
      void handleMcp(msg, io).then((res) => {
        if (res) stdout.write(`${JSON.stringify(res)}\n`);
      });
    });
    lines.on('close', () => resolve());
  });
}

/**
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, stdin?: NodeJS.ReadableStream & { isTTY?: boolean }, stdout?: NodeJS.WritableStream, fetch?: typeof fetch, out?: (s: string) => void, err?: (s: string) => void }} [io]
 */
export async function main(argv, io = {}) {
  const env = io.env ?? process.env;
  const stdin = io.stdin ?? process.stdin;
  const fetchImpl = io.fetch ?? fetch;
  const out = io.out ?? ((s) => process.stdout.write(`${s}\n`));
  const err = io.err ?? ((s) => process.stderr.write(`${s}\n`));
  const ctx = { env, fetch: fetchImpl };
  try {
    const cmd = parseArgs(argv);
    if (cmd.cmd === 'help') {
      out(USAGE);
      return 0;
    }
    if (cmd.cmd === 'mcp') {
      await serveMcp(ctx, stdin, io.stdout ?? process.stdout);
      return 0;
    }
    let body;
    if (Object.keys(cmd.opts).length) body = flagNote(cmd.opts, env.AGENT_OFFICE_WORKER_ID);
    else {
      if (stdin.isTTY) throw new UsageError('Give an OFFICE_NOTE on stdin, or pass --action and the other fields');
      const text = (await readStdin(stdin)).trim();
      if (!text) throw new UsageError('The note is empty');
      body = text;
    }
    const answer = await post(body, ctx);
    const delivery = answer.delivery === 'forwarded' ? 'Forwarded to GrokBot.' : 'Queued locally for Troy.';
    out(`${delivery}${answer.held ? ` ${answer.held}` : ''}`);
    return 0;
  } catch (error) {
    err(`office-notes: ${error.message}`);
    if (error instanceof UsageError) err(`\n${USAGE}`);
    return error instanceof UsageError ? 2 : 1;
  }
}

const invoked = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invoked) process.exitCode = await main(process.argv.slice(2));
