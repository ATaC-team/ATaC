---
name: atac-memory
description: Lightweight agent memory store for recording and retrieving reusable task patterns. Use this skill when the user wants to save, look up, or reuse a previous agent task (query pattern, tool call sequence, or workflow hint). Also use it when an agent should "remember" how it solved a similar problem before.
---

# ATaC Memory

ATaC Memory stores reusable task patterns as directory bundles in `.atac/.memory/<name>/`. Each bundle uses `index.yaml` as its entry and may include helper scripts or other local assets.

> **Global Working Directory**: Like the main `atac` CLI, all memory commands respect the `-C / --cwd` flag.
>
> **Example:** `atac -C /path/to/project memory list`

---

## Memory Bundle Format

The structured payload stored in `index.yaml` contains the following fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique slug (lowercase, `a-z`, `0-9`, `_`, `-`) |
| `description` | ✅ | One-sentence summary of the task this memory captures |
| `tags` | optional | List of topic strings for search/categorisation |
| `steps` | ✅ | Ordered list of guidance steps (at least one) |

Each **step** is flexible — it only requires `note` **or** `tool` (or both):

```text
.atac/.memory/analyze_regional_sales/
├── index.yaml
└── scripts/
    └── helper.py
```

You can still author the structured payload in YAML/JSON first and let `atac memory save` generate the bundle, or handcraft a bundle directory and import it as-is.

```yaml
name: analyze_regional_sales
description: Query and rank regions by sales volume for a given date range
tags:
  - sales
  - analytics
  - ranking
steps:
  - note: The data may not reflect the current year; probe actual date range before filtering
  - tool: execute_query
    note: Fetch a sample row first to confirm date format and available dimensions
    args:
      entity_name: orders
      dimensions:
        - orders.created_at
      limit: 5
      measures:
        - orders.count
  - tool: discover_entities
    note: When unsure about field names, discover the schema first
```

---

## CLI Commands

### `atac memory save <path>`
If `<path>` is a YAML/JSON file, validate it against the memory schema and generate `.atac/.memory/<name>/index.yaml`. If `<path>` is a directory containing `index.yaml`, validate and import the whole bundle, preserving scripts and other files.

```bash
atac memory save ./my_memory.yaml
# → Saved memory 'query_holiday_station_traffic' → .atac/.memory/query_holiday_station_traffic/index.yaml

atac memory save ./my_memory_bundle
```

### `atac memory list`
List all memory bundles with their descriptions and tags.

```bash
atac memory list
# Found 3 memory record(s):
#   analyze_regional_sales  [sales, analytics, ranking]
#     Query and rank regions by sales volume for a given date range
```

### `atac memory read <name>`
Print the structured payload stored in the bundle entry.

```bash
atac memory read query_holiday_station_traffic
```

### `atac memory search <keyword>`
Case-insensitive search across `name`, `description`, and `tags`.

```bash
atac memory search holiday
atac memory search 节假日
```

### `atac memory delete <name>`
Delete a bundle (asks for confirmation).

```bash
atac memory delete query_holiday_station_traffic
```

---

## MCP Server

ATaC Memory also ships as a standalone MCP server, exposing the same operations as tools. The MCP `memory_save(data)` tool generates the bundle entry for you.

| Tool | Description |
|------|-------------|
| `memory_save(data)` | Validate data and save a memory bundle |
| `memory_list()` | Return all memory summaries as JSON |
| `memory_read(name)` | Return the structured bundle payload as JSON |
| `memory_search(terms)` | Search records by keyword array, return matches as JSON |
| `memory_run_command(memory_name, command, args)` | Run a relative command inside a memory bundle and return stdout/stderr |
| `memory_delete(name)` | Delete a bundle |

**Start the server:**
```bash
atac memory-mcp          # stdio transport (for MCP clients)
atac memory-mcp --memory-dir /path/to/memory
```

Priority for the memory directory used by `memory-mcp`:

1. `--memory-dir`
2. `ATAC_MEMORY_DIR`
3. `.atac/.memory`

**MCP config:**
```json
{
  "mcpServers": {
    "atac-memory": {
      "command": "uvx",
      "args": ["atac", "memory-mcp", "--memory-dir", "/path/to/memory"]
    }
  }
}
```

---

## Typical Agent Workflow

1. **Before a task**: search memory for relevant past patterns.
   ```bash
   atac memory search sales
   atac memory search ranking
   ```

2. **After a successful task**: save the approach as a memory bundle so it can be reused.
   ```yaml
   # ./solved_task.yaml
   name: analyze_regional_sales
   description: Query and rank regions by sales volume for a given date range
   tags: [sales, analytics, ranking]
   steps:
     - note: Probe a sample row first to confirm date format before applying range filters
     - tool: execute_query
       note: Group by region dimension and aggregate with a sum measure
     - note: Order results descending; top-N limit can be adjusted via the limit param
   ```
   ```bash
   atac memory save ./solved_task.yaml
   ```

3. **When reusing**: `memory read` returns the embedded structured steps, guide the agent's plan accordingly.
