# Usage

[README](../README.md) · [Programs](programs.md) · [Configuration](configuration.md)

## Installation

Requires Node.js 22.19+ and pi 1.1.x.

```sh
pi install https://github.com/ATaC-team/ATaC
```

To install a specific release:

```sh
pi install git:github.com/ATaC-team/ATaC@v2.0.1
```

pi downloads the package and installs its dependencies. Restart pi or run `/reload`. See [Pi Packages](https://pi.dev/docs/latest/packages) for Git URL and version options.

## Background analysis

Give pi a task as usual. After it finishes, ATaC analyzes the completed work for reusable programs. It can extract a program from ordinary tool calls or a Codemode script. One-off work and tasks already covered by existing programs may be skipped.

Candidates go to Inbox. Background analysis never asks questions or executes candidate code. pi shows a notification when extraction or revision starts and when it finishes, including saved candidates, skipped extraction, and failures. Activity shows job progress, model usage, and diagnostics.

## Publishing permissions

Use `/atac:permissions` to view the current mode and choose another, or set it directly:

```text
/atac:permissions manual
/atac:permissions auto
```

| Mode                     | Behavior                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `manual` — Manual review | Candidates wait in Inbox for you to test and publish. This is the default.                                                             |
| `auto` — Automatic       | New revisions are tested when the main agent is idle and published if they pass. Program failures receive up to two automatic repairs. |

The setting is global, persists across restarts, and takes effect in other open pi sessions. Switching to automatic mode leaves existing candidates alone; a new candidate or revision starts a new processing chain. Saving returns immediately, and automatic chains run one at a time in each pi instance.

Without a UI, `/atac:permissions` shows the current mode and command usage. The commands with `manual` or `auto` still work.

## Inbox

Run `/atac:inbox` to open the full-screen board. Its columns group candidates into **Untested**, **In progress**, **Needs attention**, **Published**, and **Archived**. Cards distinguish new programs from updates. The board refreshes while open; narrow terminals show a sliding group of columns.

| Key        | Action                         |
| ---------- | ------------------------------ |
| Arrow keys | Move between columns and cards |
| Enter      | Open program details           |
| f          | Filter All / New / Updates     |
| a          | Open Activity                  |
| Esc        | Close                          |

Details have six tabs: **Overview**, **Manifest**, **Code**, **Tests**, **Changes**, and **Report**. Code and data files have syntax highlighting, line numbers, and wrapped lines.

| Key                            | Action                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| ← / → or 1–6                   | Switch tabs                                                     |
| ↑ / ↓, PgUp / PgDn, Home / End | Scroll; each tab remembers its position                         |
| [ / ]                          | Switch files in Changes                                         |
| t                              | Test and publish the displayed revision                         |
| r                              | Request a revision using your instructions and test diagnostics |
| x                              | Archive the candidate                                           |
| Esc                            | Return to the board                                             |

Inbox supports TUI and RPC clients with extension dialogs. RPC clients can include published and archived candidates through History. Noninteractive sessions can save candidates and use automatic publishing when enabled.

Both modes keep Inbox records. Successful candidates move to Published. Activity and the Report tab show automatic test attempts, repair rounds, and failure reasons.

## Testing and publishing

**Test and publish** runs the candidate's tests with real tools. Passing tests publish that exact revision to your local library, making it available for pi to reuse. Publishing does not upload the program to a public registry.

Review the program's declared side effects before testing. Tests use an independent pi session in the source directory, with persisted extensions, MCP servers, and permissions. Session-only tools that cannot be restored will cause tests to fail.

In automatic mode, JavaScript execution, input/output validation, and assertion failures can trigger a repair session. It receives the original task, current program, failure report, and existing program catalog. It only has library tools and must preserve the task and meaningful test coverage. The host tests each saved repair in a separate verification session, for at most three tests in one chain. Unchanged or previously failed revisions stop the chain. Tool failures, denied permissions, missing environment, and publication conflicts stop without repairs.

pi permission extensions may still ask for confirmation during testing. ATaC adds no approval prompt and does not bypass these checks.

Failed tests leave the candidate in Inbox; a failed update leaves the previous published version available. Switching to manual mode cancels automatic work, including queued chains, but does not affect a manually started test. New user input, session shutdown, or plugin reload cancels active automatic tests and repairs. Interrupted automatic chains are never replayed on restart or when automatic mode is enabled again. Diagnostics and any tool effects already produced are retained; repairs may repeat test operations, and ATaC does not undo their side effects.

## Reuse

Keep giving pi tasks in natural language. At the start of each request, ATaC adds published program IDs and purposes to the agent's system prompt. pi is instructed to prefer matching programs, inspect their contracts, and reuse them with new inputs. Pending candidates are excluded.
