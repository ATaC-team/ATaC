# Configuration

[README](../README.md) · [Usage](usage.md) · [Programs](programs.md)

ATaC works without a configuration file. Optional settings live in `~/.atac/config.json`:

```json
{
  "timeoutMs": 120000,
  "memoryLimitBytes": 268435456,
  "model": { "provider": "your-provider", "id": "your-model" }
}
```

| Setting            | Default               | Range or behavior                             |
| ------------------ | --------------------- | --------------------------------------------- |
| `timeoutMs`        | `120000` (2 minutes)  | Execution timeout; 100–3,600,000 ms           |
| `memoryLimitBytes` | `268435456` (256 MiB) | Sandbox memory limit; 1 MiB–1 GiB             |
| `model`            | Main session's model  | Provider and model ID for background analysis |

## Background analysis

Each job uses the main session's thinking level and has a three-minute limit, up to eight model responses, and at most one saved candidate. These analysis limits are separate from the execution settings above.

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
```

Program revisions are immutable. Test reports identify the tested revision, and a published version changes only after the candidate passes testing. Saved task excerpts may contain business data; avoid embedding credentials in programs.
