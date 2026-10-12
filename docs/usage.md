# Usage

[README](../README.md) · [Programs](programs.md) · [Configuration](configuration.md)

## Installation

Requires Node.js 22.19+ and pi 1.1.x.

```sh
pi install https://github.com/ATaC-team/ATaC
```

To install a specific release:

```sh
pi install git:github.com/ATaC-team/ATaC@v2.0.0
```

pi downloads the package and installs its dependencies. Restart pi or run `/reload`. See [Pi Packages](https://pi.dev/docs/latest/packages) for Git URL and version options.

## Background analysis

Give pi a task as usual. After it finishes, ATaC analyzes the completed work for reusable programs. It can extract a program from ordinary tool calls or a Codemode script. One-off work and tasks already covered by existing programs may be skipped.

Candidates go to Inbox. Background analysis never asks questions or executes candidate code. pi shows a notification when extraction or revision starts and when it finishes, including saved candidates, skipped extraction, and failures. Activity shows job progress, model usage, and diagnostics.

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

Inbox supports TUI and RPC clients with extension dialogs. RPC clients can include published and archived candidates through History. Noninteractive sessions can collect candidates but cannot publish them.

## Testing and publishing

**Test and publish** runs the candidate's tests with real tools. Passing tests publish that exact revision to your local library, making it available for pi to reuse. Publishing does not upload the program to a public registry.

Review the program's declared side effects before testing. Tests use an independent pi session in the source directory, with persisted extensions, MCP servers, and permissions. Session-only tools that cannot be restored will cause tests to fail.

Failed tests leave the candidate in Inbox. Revisions require another test run; a failed update leaves the previous published version available. New user input or session shutdown cancels testing. Interrupted tests are not replayed automatically. ATaC does not retry business operations or undo their side effects.

## Reuse

Keep giving pi tasks in natural language. At the start of each request, ATaC adds published program IDs and purposes to the agent's system prompt. pi is instructed to prefer matching programs, inspect their contracts, and reuse them with new inputs. Pending candidates are excluded.
