# ATaC MCP Server Instructions

ATaC (Agentic Trajectory as Code) MCP Server provides tools to programmatically author, inspect, and execute trajectory files (.yaml or .json).
Trajectories codify agent actions, conditions, and loops into reusable DSL assets.

## Workflow for LLMs

When interacting with the ATaC MCP Server, follow this general workflow:

1. **Initialize**: Use `atac_init` to create a new, empty trajectory file.
2. **Define State**: Use `atac_add_input` to define required runtime parameters.
3. **Build Logic**: 
   - Add tool calls using `atac_add_action`.
   - Add loops using `atac_add_for`.
   - Add conditional branches using `atac_add_if`.
   - Update state using `atac_add_set`.
4. **Targeting (`at` parameter)**: All step addition tools support an `at` parameter to specify where the step should be inserted.
   - `None` (default): Appends to the root level.
   - `0`: Inserts inside the body of step index `0` (e.g., inside a loop).
   - `0.then` or `0.else`: Inserts into conditional branches of an `if` step.
5. **Inspect**: Use `atac_show` to see the current structure and indices to calculate your next `at` path.
6. **Execute**: Use `atac_run` to execute the trajectory with specific inputs.

## Available Tools

- **`atac_init(file_path: str, name: str, description: str)`**
  Creates the base file. Example: `atac_init("task.yaml", "Search Task", "Find data")`

- **`atac_add_input(file_path: str, name: str, type: DataType, default: JsonValue)`**
  Adds a required input. Supported types: `string`, `integer`, `boolean`, `float`, `list`, `object`.
  Example: `atac_add_input("task.yaml", "cities", "list", ["Beijing", "Shanghai"])`

- **`atac_add_action(file_path: str, id: str, action: str, args: dict, at: str | None, if_condition: str | None)`**
  Adds an action (tool call).
  `action` takes URIs like `mcp://server_name/tool_name`, `bash://run`, or `kimi://web/fetch`.
  *Note on Nested Trajectories*: You can use `bash://run` with `{"command": "atac run child.yaml"}` to nest another trajectory.
  Example: `atac_add_action("task.yaml", "geo", "mcp://amap-maps/maps_geo", {"address": "${city}"})`

- **`atac_add_for(file_path: str, in_expr: str, item: str, at: str | None)`**
  Adds a loop. Expressions use Jinja2 syntax.
  Example: `atac_add_for("task.yaml", "${inputs.cities}", "city")`

- **`atac_add_if(file_path: str, condition: str, at: str | None)`**
  Adds a conditional branch.
  Example: `atac_add_if("task.yaml", "${city == 'Beijing'}")`

- **`atac_add_set(file_path: str, variables: dict, at: str | None)`**
  Sets or updates state variables.
  Example: `atac_add_set("task.yaml", {"location": "${geo.output.content[0].text.return[0].location}"})`

- **`atac_show(file_path: str)`**
  Returns the trajectory JSON structure. Use this to understand current step nested paths.

- **`atac_run(file_path: str, inputs: dict, config_paths: list | None)`**
  Executes the trajectory. Returns JSON outputs.

## Expression Syntax

- **Inputs**: `${inputs.var_name}`
- **Variables**: `${var_name}` (resolves to state variables)
- **Action Outputs**: `${action_id.output}`
  - MCP output: `${action_id.output.content[0].text}`
  - Bash output: `${action_id.output.stdout}`

## Example Usage

1. `atac_init("demo.yaml", "Demo", "Demo App")`
2. `atac_add_input("demo.yaml", "targets", "list", ["A", "B"])`
3. `atac_add_for("demo.yaml", "${inputs.targets}", "item", None)`
4. `atac_add_action("demo.yaml", "echo", "bash://run", {"command": "echo ${item}"}, "0", None)`
5. `atac_run("demo.yaml", {"targets": ["X", "Y"]})`
