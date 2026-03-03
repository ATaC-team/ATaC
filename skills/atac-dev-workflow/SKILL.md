---
name: atac-dev-workflow
description: Follow this skill when the user wants work done in the ATaC repository using their established development workflow: summarize scope first, keep changes tightly bounded, update related docs/skills/version/changelog when behavior changes, run validation, and use conventional commits.
---

# ATaC Dev Workflow

Use this skill when working in the ATaC repo or adjacent projects that depend on ATaC and the user wants changes done in their usual development style.

## Workflow Summary

1. Restate the requested change and its boundary before editing.
2. Inspect the exact codepaths first; do not guess architecture.
3. Keep the blast radius tight. If the user says a change is limited to one submodule, do not change neighboring systems.
4. Update all coupled surfaces when behavior changes:
   - core implementation
   - CLI or MCP entrypoints if affected
   - tests
   - README
   - relevant `skills/*/SKILL.md`
   - `CHANGELOG.md`
   - package version metadata when the change is user-visible
5. Validate with the smallest useful checks first, then broader checks as needed.
6. If the user asks for it, create a conventional commit directly.

## Boundary Rules

- Prefer the smallest correct change.
- Respect explicit scope constraints such as:
  - "only change atac-memory"
  - "CLI first" or "MCP only"
  - "do not touch atac core"
- If a requested storage or API format changes, propagate that format consistently through implementation, docs, tests, and migration steps.
- If a previous change introduced the wrong format, correct it cleanly instead of layering compatibility unless the user explicitly wants compatibility.

## Implementation Pattern

When making a feature or refactor:

1. Read the current implementation and locate:
   - core model/storage code
   - CLI bindings
   - MCP bindings
   - tests
   - docs and skills
2. Apply the core change first.
3. Update entrypoints and externally visible wording.
4. Update tests to match the intended interface.
5. Update version and changelog when the user asks, or when the repo’s current workflow clearly expects release bookkeeping.

## Validation Pattern

Default validation sequence:

1. `uv run ruff check src tests`
2. `uv run pytest tests/unit`

Use narrower pytest targets while iterating if that is faster, then run the broader relevant suite before closing.

If a command is blocked by sandbox restrictions and it is needed, request escalation and proceed.

## Commit Pattern

When the user asks to commit:

- Use conventional commits.
- Match the requested type exactly when given, for example:
  - `feat(...)`
  - `refactor(...)`
  - `chore: bump version X.Y.Z`
- Do not include unrelated file changes unless the user clearly wants them.

## Migration Pattern

If a format change affects downstream workspaces:

1. Inspect the external workspace state first.
2. Migrate in place only after confirming the current layout.
3. Preserve meaning over exact old shape.
4. Re-check the migrated output afterward.

Typical example:
- ATaC Memory storage changes require checking `.atac/.memory/` contents, converting entries, then verifying the new entry files exist.

## Communication Style

- Be concise and direct.
- Tell the user what you are about to inspect or change.
- Call out boundary decisions explicitly.
- Report validation results with exact commands and outcome counts.
