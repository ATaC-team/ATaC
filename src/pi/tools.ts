import { Type } from "typebox";
import {
  defineTool,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  ManifestSchema,
  type Bundle,
  type Source,
  errorText,
} from "../library/program.js";
import { Library } from "../library/storage.js";
import { runProgram, type Limits } from "../runtime/runner.js";
import { excerpt, messageText } from "../harvest/snapshot.js";

export const SaveSchema = Type.Object(
  {
    manifest: ManifestSchema,
    main: Type.String({ minLength: 1 }),
    tests: Type.String({ minLength: 1 }),
    candidate_id: Type.Optional(Type.String()),
    expected_revision: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  details: {},
});
export function sourceOf(ctx: ExtensionContext): Source {
  const branch = ctx.sessionManager.getBranch();
  const user = branch.findLast(
    (e) => e.type === "message" && e.message.role === "user",
  );
  const goal =
    user?.type === "message" && user.message.role === "user"
      ? excerpt(messageText(user.message.content), 1000).text
      : "Manually saved from pi session";
  return {
    cwd: ctx.cwd,
    session_id: ctx.sessionManager.getSessionId(),
    request_id: user?.id ?? ctx.sessionManager.getLeafId() ?? "manual",
    goal,
  };
}
export function programTools(
  library: Library,
  limits: Limits,
): ToolDefinition[] {
  return [
    defineTool({
      name: "atac_search",
      label: "Search programs",
      description: "Search published programs.",
      promptGuidelines: [
        "For repeatable tasks, search ATaC for a matching program, inspect its contract with atac_get, then reuse it with atac_run. If none fits, complete the task normally.",
      ],
      parameters: Type.Object({
        query: Type.String(),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      async execute(_id, params) {
        return result(library.search(params.query, params.limit));
      },
    }),
    defineTool({
      name: "atac_get",
      label: "Get program",
      description: "Read a program's manifest, code, tests, or test report.",
      parameters: Type.Object({
        program_id: Type.String(),
        revision: Type.Optional(Type.String()),
        include: Type.Optional(
          Type.Array(
            Type.Union([
              Type.Literal("code"),
              Type.Literal("tests"),
              Type.Literal("report"),
            ]),
          ),
        ),
      }),
      async execute(_id, p) {
        const item = library.get(p.program_id, p.revision);
        return result({
          revision: item.revision,
          manifest: item.bundle.manifest,
          ...(p.include?.includes("code") ? { main: item.bundle.main } : {}),
          ...(p.include?.includes("tests") ? { tests: item.bundle.tests } : {}),
          ...(p.include?.includes("report") ? { report: item.report } : {}),
        });
      },
    }),
    defineTool({
      name: "atac_save",
      label: "Save candidate",
      description:
        "Save a candidate to Inbox for review. main is an async JavaScript body using inputs and tools. tests uses await run(inputs), await check.equal(actual, expected), and await check.ok(condition). Declare tool dependencies and side effects. To revise, provide candidate_id and expected_revision together.",
      parameters: SaveSchema,
      async execute(_id, p, _signal, _update, ctx) {
        if (Boolean(p.candidate_id) !== Boolean(p.expected_revision))
          throw new Error(
            "candidate_id and expected_revision must be provided together",
          );
        const c = await library.save(
          p as Bundle,
          sourceOf(ctx),
          p.candidate_id
            ? { id: p.candidate_id, expected_revision: p.expected_revision! }
            : undefined,
        );
        return result({
          candidate_id: c.id,
          revision: c.revision,
          status: c.status,
        });
      },
    }),
    defineTool({
      name: "atac_run",
      label: "Run program",
      description:
        "Run a published program with new inputs using pi tools and permissions.",
      exposure: "model-only",
      parameters: Type.Object({
        program_id: Type.String(),
        revision: Type.Optional(Type.String()),
        inputs: Type.Unknown(),
      }),
      async execute(_id, p, signal, _update, ctx) {
        const item = library.get(p.program_id, p.revision);
        const started_at = new Date().toISOString();
        try {
          const execution = await runProgram(
            item.bundle,
            p.inputs,
            ctx,
            signal,
            limits,
          );
          await library.recordExecution(item.revision, {
            started_at,
            finished_at: new Date().toISOString(),
            ok: true,
            calls: execution.calls,
          });
          return {
            content: [
              ...execution.output,
              { type: "text" as const, text: JSON.stringify(execution.value) },
            ],
            details: {
              program_id: p.program_id,
              revision: item.revision,
              calls: execution.calls,
            },
          };
        } catch (error) {
          await library.recordExecution(item.revision, {
            started_at,
            finished_at: new Date().toISOString(),
            ok: false,
            diagnostic: errorText(error),
          });
          throw error;
        }
      },
    }),
  ];
}
