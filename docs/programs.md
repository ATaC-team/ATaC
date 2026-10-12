# Programs

[README](../README.md) · [Usage](usage.md) · [Configuration](configuration.md)

## Files

| File            | Contents                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `manifest.json` | Purpose, usage, input/output schemas, tool dependencies, and side effects |
| `main.js`       | An async JavaScript function body using `inputs` and `tools`              |
| `tests.js`      | Setup, calls to `run(inputs)`, assertions, and cleanup                    |

## Manifest

| Field           | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| `program_id`    | Lowercase letters, digits, and hyphens; starts with a letter or digit, at most 80 characters |
| `purpose`       | What the program does                                                                        |
| `when_to_use`   | When it is useful                                                                            |
| `tags`          | Search keywords                                                                              |
| `input_schema`  | JSON Schema for the input                                                                    |
| `output_schema` | JSON Schema for the returned value                                                           |
| `tools`         | Tool names used by the program                                                               |
| `test_tools`    | Tool names used directly by test setup and cleanup                                           |
| `side_effects`  | Description of effects from running the program and tests                                    |

All fields are required. Input/output schemas use JSON Schema Draft-07 with local references. Use the same `program_id` when proposing an update to an existing program.

## Code

Programs combine tool calls with JavaScript logic. Independent calls can run in parallel with `Promise.all`; dependent calls use earlier results.

```javascript
// main.js — inputs: { paths: ["notes/a.txt", "notes/b.txt"], output: "combined.txt" }
const notes = await Promise.all(
  inputs.paths.map((path) => tools.read({ path })),
);

await tools.write({
  path: inputs.output,
  content: notes.join("\n\n"),
});

return { output: inputs.output };
```

This example declares `read` and `write` in `tools`, accepts an array of source paths and an output path, and returns the output path. Its `side_effects` must describe creating or overwriting the output file, along with any test effects.

Each run uses a fresh Codemode sandbox. Code is an async function body, not a module. It must return JSON matching `output_schema` and await all tool calls. File and network access go through declared pi tools; imports, `process`, `fs`, `fetch`, timers, and cross-run state are unavailable. ATaC tools and nested `codemode` calls cannot be dependencies.

Use `tools["original-name"]` for tool names that are not JavaScript identifiers. Tools with `outputSchema` return `structuredContent`; other tools return joined text. MCP tools return a `CallToolResult` envelope, including `isError` and optional `structuredContent`.

## Tests

Tests must await at least one successful `run(inputs)` and one assertion. `check.equal(actual, expected, optionalLabel)` compares values; `check.ok(condition, optionalLabel)` accepts a boolean.

Use self-contained fixtures where possible. Tools used directly for setup, inspection, or cleanup belong in `test_tools`; tools called by `run` belong in `tools`. Use `try/finally` for cleanup and declare the effects of both the program and its tests. Tests run real operations with the current pi permissions; see [testing and publishing](usage.md#testing-and-publishing).

## Agent tools

| Tool          | Function                                     |
| ------------- | -------------------------------------------- |
| `atac_search` | Search published programs                    |
| `atac_get`    | Read a manifest, code, tests, or test report |
| `atac_save`   | Save a candidate to Inbox                    |
| `atac_run`    | Run a published program with new inputs      |

`atac_save` accepts `manifest`, `main`, and `tests`. To revise an existing candidate, provide `candidate_id` and `expected_revision` together. `atac_run` accepts `program_id` and `inputs`; an optional `revision` selects a specific published revision.

Saving returns the candidate immediately. In manual mode it waits in Inbox; in automatic mode the host schedules testing and publication for new revisions. Saving identical content does not schedule another test. The agent has no direct publish tool. See [publishing permissions](usage.md#publishing-permissions).
