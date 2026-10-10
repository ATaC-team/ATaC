import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  CodemodeSandbox,
  type CodemodeTool,
  type CodemodeOutputItem,
} from "@earendil-works/pi-codemode";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import {
  type Bundle,
  type Report,
  errorText,
  hash,
  validateValue,
} from "../library/program.js";

export interface Limits {
  timeoutMs: number;
  memoryLimitBytes: number;
}
export const DEFAULT_LIMITS: Limits = {
  timeoutMs: 120_000,
  memoryLimitBytes: 256 * 1024 * 1024,
};
export type ToolContext = Pick<ExtensionToolContext, "tools" | "executeTool">;
async function waitForTools(
  ctx: ToolContext,
  names: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + Math.min(timeoutMs, 10_000);
  // MCP registers tools asynchronously after session_start.
  while (
    names.some(
      (name) =>
        name.startsWith("mcp__") &&
        !ctx.tools.some((tool) => tool.name === name),
    ) &&
    Date.now() < deadline
  ) {
    await delay(50, undefined, { signal });
  }
  signal?.throwIfAborted();
}
export interface Execution {
  value: unknown;
  output: CodemodeOutputItem[];
  calls: Report["calls"];
}

// Matches pi 1.1's Codemode conversion: outputSchema + structuredContent takes
// precedence, including MCP envelopes carrying isError; other failures throw.
export function scriptValue(
  tool: ToolContext["tools"][number],
  outcome: Awaited<ReturnType<ToolContext["executeTool"]>>,
): unknown {
  if (tool.outputSchema && outcome.result.structuredContent !== undefined)
    return outcome.result.structuredContent;
  const text = outcome.result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  if (outcome.isError) throw new Error(text || `Tool "${tool.name}" failed`);
  return text;
}

class Invocation {
  pending = 0;
  failed = false;
  constructor(
    readonly ctx: ToolContext,
    readonly limits: Limits,
    readonly calls: Report["calls"] = [],
  ) {}
  tools(names: string[]): CodemodeTool[] {
    return names.map((name) => {
      const tool = this.ctx.tools.find((t) => t.name === name);
      if (!tool)
        throw new Error(`Required callable tool is unavailable: ${name}`);
      return {
        name,
        execute: async (args, { signal }) => {
          signal.throwIfAborted();
          const call = { name, status: "running" };
          this.calls.push(call);
          this.pending++;
          try {
            const outcome = await this.ctx.executeTool(name, args, { signal });
            call.status = signal.aborted
              ? "cancelled"
              : outcome.isError
                ? "error"
                : "ok";
            if (call.status !== "ok") this.failed = true;
            return scriptValue(tool, outcome);
          } catch (error) {
            call.status = signal.aborted ? "cancelled" : "error";
            this.failed = true;
            throw error;
          } finally {
            this.pending--;
          }
        },
      };
    });
  }
  async execute(
    code: string,
    names: string[],
    globals: CodemodeTool[],
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    await waitForTools(this.ctx, names, this.limits.timeoutMs, signal);
    const sandbox = new CodemodeSandbox({
      tools: this.tools(names),
      globals,
      ...this.limits,
    });
    try {
      const result = await sandbox.execute(code, { signal });
      if (!result.ok)
        throw new Error(`${result.error.kind}: ${result.error.message}`);
      signal?.throwIfAborted();
      if (
        result.calls.some((c) => c.status === "cancelled") ||
        this.pending > 0
      )
        throw new Error(
          "Program left unfinished tool calls; side effects may still be completing",
        );
      return result;
    } finally {
      await sandbox.close();
    }
  }
  async run(
    bundle: Bundle,
    inputs: unknown,
    signal?: AbortSignal,
  ): Promise<Execution> {
    validateValue(
      bundle.manifest.input_schema,
      inputs,
      "Invalid program input",
    );
    const result = await this.execute(
      `const inputs = await __atac_inputs();\n${bundle.main}`,
      bundle.manifest.tools,
      [{ name: "__atac_inputs", execute: () => inputs }],
      signal,
    );
    if (result.value === undefined)
      throw new Error("Program must return a JSON value");
    validateValue(
      bundle.manifest.output_schema,
      result.value,
      "Invalid program output",
    );
    return { value: result.value, output: result.output, calls: this.calls };
  }
}

export async function runProgram(
  bundle: Bundle,
  inputs: unknown,
  ctx: ToolContext,
  signal?: AbortSignal,
  limits = DEFAULT_LIMITS,
): Promise<Execution> {
  const deadline = AbortSignal.timeout(limits.timeoutMs);
  return new Invocation(ctx, limits).run(
    bundle,
    inputs,
    signal ? AbortSignal.any([signal, deadline]) : deadline,
  );
}

export async function testProgram(
  bundle: Bundle,
  ctx: ToolContext,
  signal?: AbortSignal,
  limits = DEFAULT_LIMITS,
): Promise<Report> {
  const execution = new Invocation(ctx, limits);
  const report: Report = {
    id: randomUUID(),
    revision: hash(bundle),
    started_at: new Date().toISOString(),
    finished_at: "",
    ok: false,
    interrupted: false,
    runs: 0,
    assertions: 0,
    calls: execution.calls,
  };
  let pending = 0;
  let failed: string | undefined;
  const guard =
    (fn: (args: unknown, signal: AbortSignal) => Promise<unknown> | unknown) =>
    async (args: unknown, context: { signal: AbortSignal }) => {
      pending++;
      try {
        context.signal.throwIfAborted();
        return await fn(args, context.signal);
      } catch (error) {
        failed ??= errorText(error);
        throw error;
      } finally {
        pending--;
      }
    };
  const deadline = AbortSignal.timeout(limits.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    // Resolve all dependencies before setup has a chance to produce side effects.
    const dependencies = [
      ...new Set([...bundle.manifest.tools, ...bundle.manifest.test_tools]),
    ];
    await waitForTools(ctx, dependencies, limits.timeoutMs, combined);
    execution.tools(dependencies);
    await execution.execute(
      bundle.tests,
      bundle.manifest.test_tools,
      [
        {
          name: "run",
          execute: guard(async (inputs, callSignal) => {
            const invocation = new Invocation(ctx, limits, execution.calls);
            const result = await invocation.run(
              bundle,
              inputs,
              AbortSignal.any([callSignal, combined]),
            );
            if (invocation.failed) execution.failed = true;
            report.runs++;
            return result.value;
          }),
        },
        {
          name: "check.equal",
          spread: true,
          execute: guard((args) => {
            if (!Array.isArray(args) || args.length < 2)
              throw new Error(
                "check.equal requires actual and expected values",
              );
            const [actual, expected, label] = args as unknown[];
            report.assertions++;
            if (!isDeepStrictEqual(actual, expected))
              throw new Error(
                `Assertion failed: ${typeof label === "string" ? label : "values are not equal"}`,
              );
            return true;
          }),
        },
        {
          name: "check.ok",
          spread: true,
          execute: guard((args) => {
            if (!Array.isArray(args) || typeof args[0] !== "boolean")
              throw new Error("check.ok requires a boolean condition");
            const [condition, label] = args as unknown[];
            report.assertions++;
            if (!condition)
              throw new Error(
                `Assertion failed: ${typeof label === "string" ? label : "condition is false"}`,
              );
            return true;
          }),
        },
      ],
      combined,
    );
    if (failed) throw new Error(failed);
    if (pending || execution.pending)
      throw new Error("Tests left unfinished calls");
    if (execution.failed)
      throw new Error(
        "One or more test/program tool calls failed or were cancelled",
      );
    if (!report.runs || !report.assertions)
      throw new Error(
        "Tests must await at least one successful run and one assertion",
      );
    report.ok = true;
  } catch (error) {
    report.diagnostic = errorText(error);
    report.interrupted = signal?.aborted ?? false;
  } finally {
    report.finished_at = new Date().toISOString();
    report.calls = execution.calls.map((c) => ({
      ...c,
      status: c.status === "running" ? "cancelled" : c.status,
    }));
  }
  return report;
}
