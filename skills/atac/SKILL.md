---
name: atac
description: DSL and CLI for building and running Agentic Trajectories (ATaC).
---

# ATaC CLI Skill (Detailed Guide)

ATaC enables building automated "trajectories" (workflows) that combine MCP tools and Bash commands with standard programming logic (loops, conditionals).

## 1. Project Setup
- **`init <name> --description <str>`**
  Creates a new trajectory workspace at `.atac/<name>/index.yaml`.
  *Example*: `atac init my_task --description "Iterate via Amap"`

- **`add-input <name> --name <n> --type [string|integer|boolean|float|list|object] [--default <json>]`**
  Defines parameters users pass at runtime.
  *Example (List)*: `atac add-input my_task --name cities --type list --default '["Beijing", "Shanghai"]'`

- **`add-variable <name> --name <n> --type <t> [--value <json>]`**
  Defines initial runtime variables (state).

- **`schema`**
  Prints the full JSON schema of the ATaC trajectory.
  *Use this to understand the valid YAML structure for direct editing.*


## 2. Building Logic (Control Flow)
- **`add-for <name> --in <expr> --item <name> [--at <path>]`**
  Iterates over a list expression. 
  *Example*: `atac add-for my_task --in '${inputs.cities}' --item city`

- **`add-if <name> --condition <expr> [--at <path>]`**
  Branches based on a Jinja2 expression.
  *Example*: `atac add-if my_task --condition "${city == 'Beijing'}" --at 0`

- **`add-set <name> --var <key=val> [--at <path>]`**
  Assigns or updates a variable.
  *Example*: `atac add-set my_task --var "status=processed" --at 0.2.then`

## 3. Tool Actions
- **`add-action <name> --id <id> --action <url> [--args <json>] [--output-to <var>] [--at <path>]`**
  Invokes an MCP tool (`mcp://server/method`) or Bash command (`bash://run`).
  *Example (MCP)*: `atac add-action my_task --id geo --action "mcp://amap-maps/maps_geo" --args '{"address": "${city}"}' --at 0`
  *Example (Kimi)*: `atac add-action my_task --id fetch --action "kimi://web/fetch" --args '{"url": "https://example.com"}'`

### Kimi-CLI Tools (Native Integration)
ATaC integrates Kimi-CLI built-in tools via the `kimi://` scheme. These provide robust capabilities without requiring external MCP servers if Kimi-CLI is installed locally.
- **`kimi://web/fetch`**: Robust web fetching with text extraction (local mode).
- **`kimi://file/read`**: Read files with line numbers and offsets.
- **`kimi://file/write`**: Write content to local files.
- **`kimi://file/glob` / `file/grep`**: Powerful file system search.

## 4. Navigating and Manipulating Workspaces
Use **`atac list`** to see all available workspaces in the current directory and their descriptions.

Use **`atac show <name>`** to view current step indices. The `--at` flag targets where to insert or delete steps:
- **`None`**: Root level (append).
- **`0`**: Inside the body of step index 0 (if it's a loop).
- **`0.2.then`**: Step 0 (Loop) -> Step 2 (If) -> inside `then` branch.

- **`rm <name> --at <path>`**
  Deletes a specific step by its index path.
  *Example*: `atac rm my_task --at 0.2.then.1`

## 5. End-to-End Example (Amap Maps)
Build a workflow that geocodes a list of cities and logs results:

```bash
# 1. Setup
atac init demo --description "Geocode loop"
atac add-input demo --name cities --type list --default '["北京市", "成都市"]'

# 2. Add For-Loop (Index 0)
atac add-for demo --in '${inputs.cities}' --item city

# 3. Add Geocode Action inside loop (at path 0)
atac add-action demo --id geo --action "mcp://amap-maps/maps_geo" \
  --args '{"address": "${city}"}' --at 0

# 4. Extract location to a variable (at path 0)
# Reference: content[0].text is the standard MCP output structure
atac add-set demo --var 'pos=${geo.output.content[0].text.return[0].location}' --at 0

# 5. Log via Bash (at path 0)
atac add-action demo --id log --action "bash://run" \
  --args '{"command": "echo City: ${city} is at ${pos}"}' --at 0

# 6. Execute (ensure MCP_CONFIG is set)
atac run demo
```

### 5.1 Nested Execution (Sub-Workflows)
You can use `bash://run` to invoke another ATaC workspace natively, enabling modular and nested workflows. Ensure the environment has the correct configurations (like `ATAC_MCP_SERVER_CONFIGS`) since the nested command runs in a sub-shell.

```bash
atac add-action wrapper_task --id nested_call --action "bash://run" \
  --args '{"command": "atac run inner_task --input param=val"}'
```

## Reference Syntax
- **Input**: `${inputs.key}`
- **Variable**: `${key}` (shorthand for `${variables.key}`)
- **Step Result**: `${step_id.output}`
  - *MCP Note*: Access values via `${id.output.content[0].text.key}`.
  - *Bash Note*: Access values via `${id.output.stdout}`.
- **Loop Accumulation**: In the final JSON output of `atac run`, repeated IDs (like those in loops) are returned as **lists** containing every result.

## 6. Direct YAML Editing
While CLI commands ensure structural safety, agents can edit the `.atac/<name>/index.yaml` trajectory directly for speed or bulk changes.

- **Check Schema First**: Always run `atac schema` to see the expected structure (e.g., specific field names for loops/ifs).
- **Validation**: After editing, try running `atac show <name>` to verify if the structure is still correctly parsed.
- **Mixed Mode**: It is common to initialize/build the foundation via CLI and then fine-tune logic or JSON arguments directly in the YAML file.

