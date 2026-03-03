---
name: atac-memory
description: Lightweight agent memory store for recording and retrieving reusable task patterns. Use this skill when the user wants to save, look up, or reuse a previous agent task (query pattern, tool call sequence, or workflow hint). Also use it when an agent should "remember" how it solved a similar problem before.
---

# ATaC Memory

ATaC Memory stores reusable task patterns as YAML records in `.atac/memory/`. Each record is a named, searchable hint — not a deterministic DSL script — giving agents flexible guidance on how to approach a class of problems.

> **Global Working Directory**: Like the main `atac` CLI, all memory commands respect the `-C / --cwd` flag.
>
> **Example:** `atac -C /path/to/project memory list`

---

## Memory Record Format

A memory file is a YAML document with the following fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique slug (lowercase, `a-z`, `0-9`, `_`, `-`) |
| `description` | ✅ | One-sentence summary of the task this memory captures |
| `tags` | optional | List of topic strings for search/categorisation |
| `steps` | ✅ | Ordered list of guidance steps (at least one) |

Each **step** is flexible — it only requires `note` **or** `tool` (or both):

```yaml
name: query_holiday_station_traffic
description: 查询特定节假日期间经停列车数量最多的车站排名
tags:
  - trains
  - statistics
  - holiday
steps:
  # Note-only step: pure observation / important caveat
  - note: 数据库中日期可能不是当前年份，先探查实际数据范围

  # Tool hint with args (illustrative, not enforced)
  - tool: execute_query
    note: 先查一条区间记录确认日期格式
    args:
      entity_name: sections
      dimensions:
        - sections.plan_leave_date
      limit: 5
      measures:
        - sections.count

  # Minimal tool hint (no args required)
  - tool: discover_entities
    note: 如果字段不确定，先查一下 schema
```

---

## CLI Commands

### `atac memory save <file>`
Validate a YAML file against the memory schema and write it to `.atac/memory/<name>.yaml`.

```bash
atac memory save ./my_memory.yaml
# → Saved memory 'query_holiday_station_traffic' → .atac/memory/query_holiday_station_traffic.yaml
```

### `atac memory list`
List all memory records with their descriptions and tags.

```bash
atac memory list
# Found 3 memory record(s):
#   query_holiday_station_traffic  [trains, statistics, holiday]
#     查询特定节假日期间经停列车数量最多的车站排名
```

### `atac memory read <name>`
Print the full YAML content of a record.

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
Delete a record (asks for confirmation).

```bash
atac memory delete query_holiday_station_traffic
```

---

## MCP Server

ATaC Memory also ships as a standalone MCP server, exposing the same operations as tools:

| Tool | Description |
|------|-------------|
| `memory_save(data)` | Validate and save a memory record |
| `memory_list()` | Return all memory summaries as JSON |
| `memory_read(name)` | Return a full record as JSON |
| `memory_search(query)` | Search records, return matches as JSON |
| `memory_delete(name)` | Delete a record |

**Start the server:**
```bash
atac memory-mcp          # stdio transport (for MCP clients)
```

**MCP config:**
```json
{
  "mcpServers": {
    "atac-memory": {
      "command": "uvx",
      "args": ["atac", "memory-mcp"]
    }
  }
}
```

---

## Typical Agent Workflow

1. **Before a task**: search memory for relevant past patterns.
   ```bash
   atac memory search "高铁 最快"
   atac memory search station
   ```

2. **After a successful task**: save the approach as a memory record so it can be reused.
   ```yaml
   # ./solved_hsr.yaml
   name: query_hsr_fastest_route
   description: 查询任意两城市间G次高铁所有径路的最快行程时间
   tags: [trains, hsr, routing]
   steps:
     - note: 先用 routes 实体过滤 full_route 包含两城市名且 train_number 含 G
     - tool: execute_query
       note: 查 sections 获取区间时刻，关键字段 serial_no / plan_leave_date / plan_arrive_date
     - note: serial_no N 代表 station[N-1]→station[N]，出发站 ca_idx 对应 depart_serial = ca_idx+1
   ```
   ```bash
   atac memory save ./solved_hsr.yaml
   ```

3. **When reusing**: `memory read` returns the steps, guide the agent's plan accordingly.
