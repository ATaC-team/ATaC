# Configuration

[README](../README.md) · [Usage](usage.md) · [Programs](programs.md)

ATaC works without a configuration file. Optional settings live in `~/.atac/config.json`:

```json
{
  "permissions": "manual",
  "timeoutMs": 120000,
  "memoryLimitBytes": 268435456,
  "model": { "provider": "your-provider", "id": "your-model" }
}
```

| Setting            | Default               | Range or behavior                                                      |
| ------------------ | --------------------- | ---------------------------------------------------------------------- |
| `permissions`      | `manual`              | `manual` for Inbox review; `auto` for automatic testing and publishing |
| `timeoutMs`        | `120000` (2 minutes)  | Execution timeout; 100–3,600,000 ms                                    |
| `memoryLimitBytes` | `268435456` (256 MiB) | Sandbox memory limit; 1 MiB–1 GiB                                      |
| `model`            | Main session's model  | Provider and model ID for extraction and revisions                     |

Set publishing permissions with `/atac:permissions manual` or `/atac:permissions auto`. The command preserves other settings and updates open sessions immediately. Older configurations without `permissions` retain manual review. ATaC also maintains `permissionVersion` to revoke in-flight automatic work when the mode changes; leave this field managed by the command.

## Background analysis

Each job uses the main session's thinking level and has a three-minute limit, up to eight model responses, and at most one saved candidate. These analysis limits are separate from the execution settings above.

Automatic publishing permits two repair rounds after the initial test. Each repair uses the same analysis limits and model selection. The retry budget belongs to the entire chain, including its new revisions. See [publishing permissions](usage.md#publishing-permissions) for cancellation and failure handling.

Before deciding whether to save, the analysis session receives the current published programs and Inbox candidates, including archived proposals. It compares capabilities, skips duplicates, and proposes meaningful updates under the existing program ID. Analysis sessions have only library tools.

## Local storage

Data is stored in `~/.atac`:

```text
config.json    Optional settings
objects/       Program files, addressed by content hash
programs/      Published versions
inbox/         Candidates and revision history
reports/       Test reports and execution summaries
jobs/          Background jobs, snapshots, and model usage
automation/    Automatic chains, test attempts, repairs, and outcomes
```

Program revisions are immutable. Test reports identify the tested revision, and a published version changes only after the candidate passes testing. Saved task excerpts may contain business data; avoid embedding credentials in programs.
