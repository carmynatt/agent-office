# Office Space

Back to the [README](../README.md).

Office Space sits on this fork of Agent Office. The floor, desks, hire dialog, terminals, camera and `/lite` view are the ones you already have. What changed is who sits at a desk, what color they wear, and where notes go.

## Clothing

A worker's color is their shirt.

| Who | Color |
| --- | --- |
| Claude Code and Codex | `#FF8A5B` |
| Cursor | `#7C6AF7` |
| Troy (GrokBot) and shell workers | `#8D99AE` |

Board agents (Issues, PRs, the queue) keep the colors they already had. OpenCode, Grok, Muse, DeepSeek Harness, Pi and a custom `--agent` still get a random desk color.

## Cursor desks

Hire **Cursor** the same way as Claude Code or Codex: walk to an empty desk, press **E**, and pick it. The office looks up `cursor-agent`, then `agent`. `--agent cursor-agent`, `--agent agent` and `--agent cursor` all select Cursor as the default. Claude (`claude`) and Codex (`codex`) are unchanged.

Cursor's terminal is its own CLI. The office does not meter its spend.

## Notes for Troy

Workers do not call Notion. Shared notes go to **Troy**, the GrokBot middleman, in the `OFFICE_NOTE` shape in [`AGENTS.md`](../AGENTS.md).

From a worker's terminal:

```sh
office-notes <<'EOF'
OFFICE_NOTE
action: create
target: notes
title: Worktrees required for parallel agents
type: lore
provider: Cursor
source_agent: cursor-desk-1
summary: Each hired worker gets its own git worktree.
EOF
```

`office-notes mcp` exposes one tool, `submit_office_note`, for an MCP client. Both post to `POST /hooks/notes` on the office's loopback hook port, with the worker's `AGENT_OFFICE_WORKER_ID` and `AGENT_OFFICE_HOOK_TOKEN`.

When `GROKBOT_WEBHOOK_URL` is set, the office also POSTs the note there as JSON (`format`, `text`, `note`). When it is unset, the note is appended to `<office home>/.office-space/notes.jsonl` and shown on Troy's board (north wall, past the merge gong) and under **📝 Notes** on `/lite`. A Notion URL in that variable is ignored: this process does not call Notion. A failed webhook still leaves the note in the local queue.

If the webhook wants a sender key, set `GROKBOT_WEBHOOK_SECRET` or `GROKBOT_WEBHOOK_TOKEN`. The office sends it as `Authorization: Bearer <key>`. When both are set, `GROKBOT_WEBHOOK_SECRET` is the one that goes out. Leave them unset and the POST is the JSON body only.

Troy wears `#8D99AE` and stands beside the board. Press **E** there, or open the command palette and choose **Troy's notes**.
