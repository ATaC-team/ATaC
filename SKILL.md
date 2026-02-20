---
name: atac
description: DSL and CLI for building and running Agentic Trajectories (ATaC).
---

# ATaC CLI Skill (Detailed Guide)

ATaC enables building automated "trajectories" (workflows) that combine MCP tools and Bash commands with standard programming logic (loops, conditionals).

## 1. Project Setup
- **`init <file> --name <str> --description <str>`**
  Creates a new trajectory file.
  *Example*: `atac init my_task.yaml --name "Search & Log" --description "Iterate via Amap"`

- **`add-input <file> --name <n> --type [string|integer|boolean|float|list|object] [--default <json>]`**
  Defines parameters users pass at runtime.
  *Example (List)*: `atac add-input task.yaml --name cities --type list --default '["Beijing", "Shanghai"]'`

- **`add-variable <file> --name <n> --type <t> [--value <json>]`**
  Defines initial runtime variables (state).

- **`schema`**
  Prints the full JSON schema of the ATaC trajectory.
  *Use this to understand the valid YAML structure for direct editing.*


## 2. Building Logic (Control Flow)
- **`add-for <file> --in <expr> --item <name> [--at <path>]`**
  Iterates over a list expression. 
  *Example*: `atac add-for task.yaml --in '${inputs.cities}' --item city`

- **`add-if <file> --condition <expr> [--at <path>]`**
  Branches based on a Jinja2 expression.
  *Example*: `atac add-if task.yaml --condition "${city == 'Beijing'}" --at 0`

- **`add-set <file> --var <key=val> [--at <path>]`**
  Assigns or updates a variable.
  *Example*: `atac add-set task.yaml --var "status=processed" --at 0.2.then`

## 3. Tool Actions
- **`add-action <file> --id <id> --action <url> [--args <json>] [--output-to <var>] [--at <path>]`**
  Invokes an MCP tool (`mcp://server/method`) or Bash command (`bash://run`).
  *Example (MCP)*: `atac add-action t.yaml --id geo --action "mcp://amap-maps/maps_geo" --args '{"address": "${city}"}' --at 0`

## 4. Navigating with `--at`
Use **`atac show <file>`** to view current step indices. The `--at` flag targets where to insert new steps:
- **`None`**: Root level (append).
- **`0`**: Inside the body of step index 0 (if it's a loop).
- **`0.2.then`**: Step 0 (Loop) -> Step 2 (If) -> inside `then` branch.

## 5. End-to-End Example (Amap Maps)
Build a workflow that geocodes a list of cities and logs results:

```bash
# 1. Setup
atac init demo.yaml --name "Amap Demo" --description "Geocode loop"
atac add-input demo.yaml --name cities --type list --default '["北京市", "成都市"]'

# 2. Add For-Loop (Index 0)
atac add-for demo.yaml --in '${inputs.cities}' --item city

# 3. Add Geocode Action inside loop (at path 0)
atac add-action demo.yaml --id geo --action "mcp://amap-maps/maps_geo" \
  --args '{"address": "${city}"}' --at 0

# 4. Extract location to a variable (at path 0)
# Reference: content[0].text is the standard MCP output structure
atac add-set demo.yaml --var 'pos=${geo.output.content[0].text.return[0].location}' --at 0

# 5. Log via Bash (at path 0)
atac add-action demo.yaml --id log --action "bash://run" \
  --args '{"command": "echo City: ${city} is at ${pos}"}' --at 0

# 6. Execute (ensure MCP_CONFIG is set)
atac run demo.yaml
```

## Reference Syntax
- **Input**: `${inputs.key}`
- **Variable**: `${key}` (shorthand for `${variables.key}`)
- **Step Result**: `${step_id.output}`
  - *MCP Note*: Access values via `${id.output.content[0].text.key}`.
  - *Bash Note*: Access values via `${id.output.stdout}`.
- **Loop Accumulation**: In the final JSON output of `atac run`, repeated IDs (like those in loops) are returned as **lists** containing every result.

## 6. Direct YAML Editing
While CLI commands ensure structural safety, agents can edit the YAML trajectory directly for speed or bulk changes.

- **Check Schema First**: Always run `atac schema` to see the expected structure (e.g., specific field names for loops/ifs).
- **Validation**: After editing, try running `atac show <file>` to verify if the structure is still correctly parsed.
- **Mixed Mode**: It is common to initialize/build the foundation via CLI and then fine-tune logic or JSON arguments directly in the YAML file.

