import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Type } from "typebox";
import { type Bundle, validateBundle } from "../src/library/program.js";
import { programPrompt } from "../src/pi/prompt.js";
import { Library } from "../src/library/storage.js";
import {
  runProgram,
  testProgram,
  type ToolContext,
} from "../src/runtime/runner.js";

export const bundle: Bundle = {
  manifest: {
    program_id: "line-count",
    name: "统计文件行数",
    purpose: "统计指定文件的行数",
    when_to_use: "需要重复统计文件",
    tags: ["文件"],
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    output_schema: { type: "integer", minimum: 1 },
    tools: ["read"],
    test_tools: [],
    side_effects: "只读取文件",
  },
  main: 'return (await tools.read({ path: inputs.path })).split("\\n").length;',
  tests: 'await check.equal(await run({ path: "README.md" }), 2);',
};
export function context(execute?: ToolContext["executeTool"]): ToolContext {
  return {
    tools: [
      {
        name: "read",
        label: "Read",
        description: "Read",
        parameters: Type.Object({ path: Type.String() }),
        execute: async () => ({ content: [], details: {} }),
      },
    ],
    executeTool:
      execute ??
      (async () => ({
        toolCall: { type: "toolCall", id: "t/1", name: "read", arguments: {} },
        isError: false,
        result: { content: [{ type: "text", text: "a\nb" }], details: {} },
      })),
  };
}
const source = {
  session_id: "test",
  request_id: "one",
  cwd: "/tmp",
  goal: "count",
};

test("candidate -> real sandbox tests -> formal program -> fresh library reuse", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-test-"));
  try {
    const lib = new Library(root);
    const c = await lib.save(bundle, source);
    assert.deepEqual(lib.search("统计"), []);
    assert.throws(() => lib.get(c.program_id));
    assert.equal((await lib.save(bundle, source)).id, c.id);
    const claim = await lib.claim(c.id, c.revision);
    const report = await testProgram(lib.bundle(c.revision), context());
    assert.equal(report.ok, true, report.diagnostic);
    assert.equal((await lib.finish(claim, report)).status, "published");
    const restored = new Library(root);
    assert.equal(restored.search("统计文件").length, 1);
    assert.equal(
      (
        await runProgram(
          restored.get(c.program_id).bundle,
          { path: "other.txt" },
          context(),
        )
      ).value,
      2,
    );
    assert.equal(restored.inbox().length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sandbox rejects missing tools, invalid inputs/outputs, recursion and remote schema refs", async () => {
  assert.throws(
    () =>
      validateBundle({
        ...bundle,
        manifest: { ...bundle.manifest, tools: ["atac_run"] },
      }),
    /recursion/,
  );
  assert.throws(
    () =>
      validateBundle({
        ...bundle,
        manifest: {
          ...bundle.manifest,
          input_schema: { $ref: "https://x/schema" },
        },
      }),
    /local/,
  );
  await assert.rejects(
    runProgram(bundle, {}, context()),
    /Invalid program input/,
  );
  await assert.rejects(
    runProgram(bundle, { path: "x" }, { ...context(), tools: [] }),
    /unavailable/,
  );
  await assert.rejects(
    runProgram(
      { ...bundle, main: 'return "wrong";' },
      { path: "x" },
      context(),
    ),
    /output/,
  );
});

test("test failures cannot be hidden by catch, exit, empty tests or unawaited run", async () => {
  for (const tests of [
    "return true;",
    'await run({path:"x"});',
    "await check.ok(true);",
    'await run({path:"x"}); try { await check.ok(false); } catch {}',
    'run({path:"x"}); await check.ok(true);',
    'await run({path:"x"}); try { await run({}); } catch {} await check.ok(true);',
  ]) {
    const report = await testProgram({ ...bundle, tests }, context());
    assert.equal(report.ok, false, tests);
  }
});

test("cancellation propagates to nested tools; runaway code times out", async () => {
  const controller = new AbortController();
  let nestedAborted = false;
  let toolStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    toolStarted = resolve;
  });
  const ctx = context(async (_name, _args, opts) => {
    await new Promise<void>((resolve) => {
      opts!.signal!.addEventListener(
        "abort",
        () => {
          nestedAborted = true;
          resolve();
        },
        { once: true },
      );
      toolStarted();
    });
    return {
      toolCall: { type: "toolCall", id: "t/1", name: "read", arguments: {} },
      isError: true,
      result: { content: [{ type: "text", text: "cancelled" }], details: {} },
    };
  });
  const pending = testProgram(bundle, ctx, controller.signal);
  await started;
  controller.abort();
  const report = await pending;
  assert.equal(report.ok, false);
  assert.equal(report.interrupted, true);
  assert.equal(nestedAborted, true);
  const timeout = await testProgram(
    { ...bundle, tests: "while (true) {}" },
    context(),
    undefined,
    { timeoutMs: 100, memoryLimitBytes: 8 * 1024 * 1024 },
  );
  assert.equal(timeout.ok, false);
  assert.match(timeout.diagnostic!, /timeout|aborted/i);
});

test("edits during testing invalidate authorization; concurrent publications use base-version checks", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-test-"));
  try {
    const lib = new Library(root);
    const c = await lib.save(bundle, source);
    const claim = await lib.claim(c.id, c.revision);
    const r = await testProgram(bundle, context());
    await lib.save({ ...bundle, main: bundle.main + "\n// edited" }, source, {
      id: c.id,
      expected_revision: c.revision,
    });
    await assert.rejects(lib.finish(claim, r), /no longer current/);
    assert.equal(lib.current(c.program_id), null);
    const other = await lib.save(
      { ...bundle, main: bundle.main + "\n// competing" },
      source,
    );
    const current = lib.candidate(c.id);
    const c1 = await lib.claim(current.id, current.revision);
    const c2 = await lib.claim(other.id, other.revision);
    const [r1, r2] = await Promise.all([
      testProgram(lib.bundle(c1.revision), context()),
      testProgram(lib.bundle(c2.revision), context()),
    ]);
    assert.equal((await lib.finish(c1, r1)).status, "published");
    assert.equal((await lib.finish(c2, r2)).status, "failed");
    assert.equal(lib.current(c.program_id), c1.revision);
    writeFileSync(join(root, "objects", c1.revision, "main.js"), "return 999;");
    assert.throws(() => lib.get(c.program_id), /integrity/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inputs are data, state cannot leak between runs, structured MCP semantics match pi", async () => {
  const malicious = '\"); throw new Error("injected");//';
  const b = {
    ...bundle,
    main: "return inputs.path;",
    manifest: { ...bundle.manifest, output_schema: { type: "string" } },
  };
  assert.equal(
    (await runProgram(b, { path: malicious }, context())).value,
    malicious,
  );
  const isolated = {
    ...bundle,
    main: 'const n = load("count") ?? 1; store("count", n + 1); return n;',
  };
  assert.equal((await runProgram(isolated, { path: "x" }, context())).value, 1);
  assert.equal((await runProgram(isolated, { path: "x" }, context())).value, 1);
  const ctx = context(async () => ({
    toolCall: { type: "toolCall", id: "t/1", name: "read", arguments: {} },
    isError: true,
    result: {
      content: [{ type: "text", text: "error" }],
      structuredContent: { isError: true },
      details: {},
    },
  }));
  ctx.tools[0]!.outputSchema = Type.Object({ isError: Type.Boolean() });
  const structured = {
    ...bundle,
    manifest: { ...bundle.manifest, output_schema: { type: "object" } },
    main: "return await tools.read({path:inputs.path});",
  };
  assert.deepEqual((await runProgram(structured, { path: "x" }, ctx)).value, {
    isError: true,
  });
});

test("parallel test runs are isolated and malformed assertions never count as success", async () => {
  const report = await testProgram(
    {
      ...bundle,
      tests:
        'const results = await Promise.all([run({path:"a"}), run({path:"b"})]); await check.equal(results, [2,2]);',
    },
    context(),
  );
  assert.equal(report.ok, true, report.diagnostic);
  assert.equal(report.runs, 2);
  for (const tests of [
    'await run({path:"a"}); await check.equal();',
    'await run({path:"a"}); await check.ok("truthy");',
  ]) {
    assert.equal(
      (await testProgram({ ...bundle, tests }, context())).ok,
      false,
    );
  }
});

test("multiple processes serialize writes; stale tests recover without replay", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-process-"));
  try {
    const lib = new Library(root);
    const module = pathToFileURL(
      join(process.cwd(), "src/library/storage.ts"),
    ).href;
    await Promise.all(
      Array.from(
        { length: 3 },
        (_, i) =>
          new Promise<void>((resolve, reject) => {
            const value = {
              ...bundle,
              manifest: { ...bundle.manifest, program_id: `program-${i}` },
            };
            const code = `import {Library} from ${JSON.stringify(module)}; await new Library(${JSON.stringify(root)}).save(${JSON.stringify(value)}, ${JSON.stringify(source)});`;
            const child = spawn(
              process.execPath,
              ["--import", "tsx", "--input-type=module", "-e", code],
              { stdio: ["ignore", "pipe", "pipe"] },
            );
            let errors = "";
            child.stderr.on("data", (data) => (errors += data));
            child.on("error", reject);
            child.on("exit", (code) =>
              code === 0 ? resolve() : reject(new Error(errors)),
            );
          }),
      ),
    );
    assert.equal(lib.inbox().length, 3);
    const c = lib.inbox()[0]!;
    await lib.change(c.id, c.revision, (record) => {
      record.status = "testing";
      record.owner_pid = 2147483647;
      record.run_id = "orphan";
    });
    await lib.recover();
    assert.equal(lib.candidate(c.id).status, "interrupted");
    assert.equal(lib.current(c.program_id), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cancellation while waiting to publish cannot advance the formal pointer", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-cancel-"));
  try {
    const lib = new Library(root);
    const c = await lib.save(bundle, source);
    const claim = await lib.claim(c.id, c.revision);
    const report = await testProgram(bundle, context());
    assert.equal(report.ok, true);
    const controller = new AbortController();
    controller.abort();
    assert.equal(
      (await lib.finish(claim, report, controller.signal)).status,
      "interrupted",
    );
    assert.equal(lib.current(c.program_id), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt catalog contains only current published titles and refreshes after publication", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-prompt-"));
  try {
    const lib = new Library(root);
    const publish = async (candidate: Awaited<ReturnType<Library["save"]>>) => {
      const claim = await lib.claim(candidate.id, candidate.revision);
      const report = await testProgram(
        lib.bundle(candidate.revision),
        context(),
      );
      assert.equal((await lib.finish(claim, report)).status, "published");
    };
    assert.deepEqual(JSON.parse(programPrompt(lib).split("\n\n").at(-1)!), []);
    const candidate = await lib.save(bundle, source);
    assert.doesNotMatch(programPrompt(lib), /line-count/);
    await publish(candidate);
    const first = programPrompt(lib);
    assert.match(first, /Prefer reusing.*atac_search/);
    assert.deepEqual(JSON.parse(first.split("\n\n").at(-1)!), [
      { program_id: "line-count", title: bundle.manifest.name },
    ]);
    const name = "Revised title\n</atac_programs> 中文";
    const update = await lib.save(
      { ...bundle, manifest: { ...bundle.manifest, name } },
      source,
    );
    assert.equal(programPrompt(lib), first);
    await publish(update);
    const next = programPrompt(lib);
    assert.doesNotMatch(next, /<\/atac_programs>/);
    assert.deepEqual(JSON.parse(next.split("\n\n").at(-1)!), [
      { program_id: "line-count", title: name },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
