// Cursor: a desk provider beside Claude Code and Codex. The office looks up `cursor-agent`, then
// `agent` (see commandNames in agents.ts). Its spend isn't metered here, and it reports no hooks.
import type { ProviderAdapter } from './types.js';

export const cursor: ProviderAdapter = {
  id: 'cursor',
  launch({ args, prompt }) {
    // Interactive TUI. A first task is a positional prompt; resume starts a fresh CLI (no session flag
    // this CLI is known to share with the others).
    if (prompt) args.push(prompt);
    return { args };
  },
  titleNoise: /^(cursor-agent|cursor|agent)$/i,
};
