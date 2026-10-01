# Office Space — agent notes (GrokBot middleman)

Shared knowledge lives in Notion (**Office Space KB**). **Do not write Notion yourself.** Send note requests to **GrokBot / Troy** (Carson’s Grok Bot for this project).

## Provider identity
- If you are Claude Codex: set `provider: Claude Codex` (clothing: orange `#FF8A5B`).
- If you are Cursor: set `provider: Cursor` (clothing: purple `#7C6AF7`).

## Note request format

Message Troy with:

```
OFFICE_NOTE
action: create | update | query
target: notes | decisions | handoffs
title: <short title>
type: decision | lore | handoff | howto | status | bug
provider: Claude Codex | Cursor
project: <optional>
tags: office, infra, product
source_agent: <your name or session id>
summary: <1-3 sentences>
body: <optional longer detail>
open_questions: <handoffs only>
from: <handoffs only — Claude Codex | Cursor | GrokBot>
to: <handoffs only — Claude Codex | Cursor | GrokBot>
```

### Actions
| action | Meaning |
|--------|---------|
| create | New row in the target DB |
| update | Change existing note (include matching `title` or Notion URL in `body`) |
| query | Ask for a context pack; no write |

### Targets
| target | DB | Use for |
|--------|-----|---------|
| notes | Agent Notes | lore, howto, status, bug, general memory |
| decisions | Decisions | durable calls (why + owner) |
| handoffs | Handoffs | agent→agent context |

### Rules
1. Always set `provider` and `source_agent`.
2. One topic per request; keep `summary` short.
3. GrokBot is the sole Notion writer (`Written By` = GrokBot).
4. For **query**, require: `action`, `target`, `provider`, `source_agent`, and the question in `summary`.

## Examples

### Create lore
```
OFFICE_NOTE
action: create
target: notes
title: Worktrees required for parallel agents
type: lore
provider: Cursor
project: Office Space
tags: office, infra
source_agent: cursor-desk-1
summary: Each hired worker gets its own git worktree; never share a dirty checkout.
```

### Handoff
```
OFFICE_NOTE
action: create
target: handoffs
title: PR #12 needs UI pass
type: handoff
provider: Claude Codex
from: Claude Codex
to: Cursor
project: Office Space
source_agent: codex-1
summary: Backend done; needs hire-modal polish.
open_questions: Desktop vs mobile priority?
```

### Query
```
OFFICE_NOTE
action: query
target: notes
provider: Cursor
source_agent: cursor-desk-1
summary: What clothing colors do we use for providers?
```

## Notion (human reference)
- Root: Office Space KB (Notion)
- Spec note: “GrokBot note-request format (Codex + Cursor)” in Agent Notes

From a desk, send the block with `office-notes` (on your PATH) or the `submit_office_note` MCP tool. Both post to the office’s loopback `POST /hooks/notes`. They do not call Notion.
