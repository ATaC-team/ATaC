# ATaC

A reusable program library for [pi](https://github.com/badlogic/pi-mono).

ATaC turns completed tasks into programs that call pi tools. Candidates are collected in an Inbox. pi shows a notification when background extraction or revision starts and when it finishes. You review and test them before publishing; pi can then find and reuse them with new inputs.

## Install

Requires Node.js 22.19+ and pi 1.1.x.

```sh
npm ci
pi install /absolute/path/to/ATaC
```

Restart pi or run `/reload`, then open:

```text
/atac:inbox
```

## Inbox

In the terminal, `/atac:inbox` opens a full-screen board with **Untested**, **In progress**, **Needs attention**, **Published**, and **Archived** columns. Cards show whether a program is new or an update. The board refreshes while open.

Use the arrow keys to move between columns and cards, **Enter** to open a card, **f** to filter All / New / Updates, **a** for Activity, and **Esc** to close. Narrow terminals show a sliding group of columns. Enter opens program details directly. Switch tabs with **←/→** or **1–6**: Overview, Manifest, Code, Tests, Changes, and Report. Files have syntax highlighting, line numbers, and wrapped lines. Scroll with **↑/↓**, **PgUp/PgDn**, or **Home/End**; each tab remembers its position. In Changes, use **[ / ]** to switch files.

- **t — Test and publish** — Run the displayed candidate's tests. Passing tests publish that revision.
- **r — Revise** — Ask the agent to update a candidate using your instructions and test diagnostics.
- **x — Archive** — Remove a candidate from the pending list.
- **Activity** — View background jobs, model usage, and diagnostics.
- **History** — Include published and archived candidates in RPC clients.

Notifications report saved candidates, skipped extraction, failures, or paused jobs. Background analysis never asks questions or runs candidate code. Failed tests leave the candidate in Inbox. Revisions require another test run; a failed update leaves the published version available.

Tests use real tools and may have the declared side effects. Existing pi permission extensions still apply. New user input or session shutdown cancels testing. Interrupted tests are not replayed automatically.

Inbox supports TUI and RPC clients with extension dialogs. Noninteractive sessions can collect candidates but cannot publish them.

## Programs

| File            | Contents                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `manifest.json` | Purpose, usage, input/output schemas, tool dependencies, and side effects |
| `main.js`       | An async JavaScript function body using `inputs` and `tools`              |
| `tests.js`      | Setup, calls to `run(inputs)`, assertions, and cleanup                    |

```javascript
// main.js
return { total: inputs.values.reduce((sum, value) => sum + value, 0) };
```

```javascript
// tests.js
const result = await run({ values: [2, 3] });
await check.equal(result.total, 5);
```

Programs return JSON and must await tool calls. Tests must await at least one successful `run` and one assertion. `check.equal(actual, expected)` compares values; `check.ok(condition)` accepts a boolean. Input/output schemas use JSON Schema Draft-07 with local references.

Each run uses a fresh Codemode sandbox. File and network access go through declared pi tools. Program dependencies belong in `tools`; setup and cleanup dependencies belong in `test_tools`. ATaC tools and nested `codemode` calls cannot be program dependencies.

Tool results follow pi Codemode conventions: tools with `outputSchema` return `structuredContent`; other tools return text. MCP tools return a `CallToolResult` envelope, including `isError` and optional `structuredContent`.

## Agent tools

At the start of each request, ATaC adds the current published program titles and IDs to the agent’s system prompt. The agent is instructed to prefer matching programs, inspect their contracts with `atac_get`, and reuse them with `atac_run`. Pending candidates are excluded.

| Tool          | Function                                     |
| ------------- | -------------------------------------------- |
| `atac_search` | Search published programs                    |
| `atac_get`    | Read a manifest, code, tests, or test report |
| `atac_save`   | Save a candidate to Inbox                    |
| `atac_run`    | Run a published program with new inputs      |

## Storage and settings

Data is stored in `~/.atac`:

```text
config.json    Optional settings
objects/       Program files, addressed by content hash
programs/      Published versions
inbox/         Candidates and revision history
reports/       Test reports and execution summaries
jobs/          Background jobs, snapshots, and model usage
```

Optional `config.json`:

```json
{
  "timeoutMs": 120000,
  "memoryLimitBytes": 268435456,
  "model": { "provider": "your-provider", "id": "your-model" }
}
```

By default, background analysis uses the main session's model and thinking level. Each job has a three-minute limit, up to eight model responses, and can save one candidate. Each analysis starts with the current published programs and Inbox candidates, including archived proposals. The catalog includes names, purposes, usage conditions, and candidate status. The agent compares capabilities, skips duplicates, and uses the existing program ID for meaningful updates. Analysis sessions have only library tools. Saved task excerpts may contain business data; avoid embedding credentials in programs.

Tests run in an independent pi session in the source directory, with persisted extensions, MCP servers, and permissions. Session-only tools that cannot be restored will cause tests to fail. ATaC does not retry business operations or undo their side effects.

## Development

```sh
npm ci
npm run check
npm test
npm run test:package
```

```text
src/
  extension.ts   pi lifecycle
  config.ts      Settings
  library/       Schemas, storage, versions, search
  runtime/       Execution and verification
  harvest/       Snapshots and background analysis
  pi/            Tools and Inbox
test/            Tests and fixtures
scripts/         Build and package checks
```

Design: [RFC #4](https://github.com/ATaC-team/ATaC/issues/4). Version 2 replaces the Python implementation; version 1 remains in Git history and releases.

MIT License.
