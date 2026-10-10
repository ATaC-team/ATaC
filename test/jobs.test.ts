import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Jobs } from "../src/harvest/jobs.js";
import { Library, atomicJson } from "../src/library/storage.js";
import { DEFAULT_LIMITS } from "../src/runtime/runner.js";
import { testProgram } from "../src/runtime/runner.js";
import { type Bundle } from "../src/library/program.js";
import { type Snapshot } from "../src/harvest/snapshot.js";

test("analysis SDK has only library tools, notifies once per lifecycle, deduplicates and records usage", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-jobs-"));
  const library = new Library(root);
  const candidate: Bundle = {
    manifest: {
      program_id: "sum",
      name: "sum",
      purpose: "add values",
      when_to_use: "repeated sums",
      tags: [],
      input_schema: { type: "array", items: { type: "number" } },
      output_schema: { type: "number" },
      tools: [],
      test_tools: [],
      side_effects: "none",
    },
    main: "return inputs.reduce((a,b) => a+b, 0);",
    tests: "await check.equal(await run([2,3]), 5);",
  };
  let calls = 0;
  const notices: { message: string; type: string }[] = [];
  const provider = {
    baseUrl: "http://unused.invalid",
    apiKey: "fixture-key",
    api: "openai-completions",
    models: [
      {
        id: "test-model",
        name: "Test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 2000,
      },
    ],
    streamSimple: (_model: unknown, context: { messages: unknown[] }) => {
      calls++;
      const data = JSON.stringify(context);
      assert.ok(!data.includes('"name":"bash"'));
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant",
        api: "openai-completions",
        provider: "atac-fixture",
        model: "test-model",
        timestamp: Date.now(),
        stopReason: calls < 3 ? "toolUse" : "stop",
        content:
          calls === 1
            ? [
                {
                  type: "toolCall",
                  id: "search",
                  name: "atac_search",
                  arguments: { query: "sum" },
                },
              ]
            : calls === 2
              ? [
                  {
                    type: "toolCall",
                    id: "save",
                    name: "atac_save",
                    arguments: JSON.parse(JSON.stringify(candidate)),
                  },
                ]
              : [{ type: "text", text: "Candidate saved" }],
        usage: {
          input: 10,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 20,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        stream.push({
          type: "done",
          reason: message.stopReason as "stop" | "toolUse",
          message,
        });
        stream.end();
      });
      return stream;
    },
  };
  const ctx = {
    model: { provider: "atac-fixture", id: "test-model" },
    modelRegistry: {
      getRegisteredNativeProvider: () => undefined,
      getRegisteredProviderConfig: () => provider,
    },
    hasUI: true,
    ui: {
      notify: (message: string, type: string) =>
        notices.push({ message, type }),
    },
  } as unknown as ExtensionContext;
  const snapshot: Snapshot = {
    source: { cwd: root, session_id: "s", request_id: "r", goal: "sum values" },
    messages: [],
    calls: [{ name: "codemode", code: "return 2+3" }],
    tools: [],
    truncated: false,
  };
  const jobs = new Jobs(library, DEFAULT_LIMITS);
  try {
    await jobs.enqueue(snapshot, ctx);
    await jobs.waitForIdle();
    assert.equal(jobs.list()[0]!.state, "done", jobs.list()[0]!.diagnostic);
    assert.equal(library.inbox().length, 1);
    assert.equal(library.inbox()[0]!.status, "untested");
    assert.equal(library.current("sum"), null);
    assert.equal(jobs.list()[0]!.usage!.responses, 3);
    assert.equal(jobs.list()[0]!.usage!.tokens, 60);
    await jobs.enqueue(snapshot, ctx);
    await jobs.waitForIdle();
    assert.equal(calls, 3);
    assert.equal(jobs.list().length, 1);
    assert.deepEqual(notices, [
      { message: "ATaC: Program extraction started.", type: "info" },
      {
        message: "ATaC: Program saved. Open /atac:inbox to review.",
        type: "info",
      },
    ]);
    // Simulate a crash after saving the candidate but before committing job completion.
    const saved = library.inbox()[0]!;
    const interrupted = jobs.list()[0]!;
    interrupted.state = "running";
    interrupted.owner_pid = 2147483647;
    delete interrupted.saved_id;
    atomicJson(join(root, "jobs", `${interrupted.id}.json`), interrupted);
    const retry = scriptedContext((n) =>
      n === 1
        ? [
            {
              type: "toolCall",
              id: "retry-save",
              name: "atac_save",
              arguments: JSON.parse(
                JSON.stringify({ ...candidate, main: "return 999;" }),
              ),
            },
          ]
        : [{ type: "text", text: "Saved" }],
    );
    const recovered = new Jobs(library, DEFAULT_LIMITS);
    recovered.start(retry.ctx);
    await recovered.waitForIdle();
    await recovered.stop();
    assert.equal(recovered.list()[0]!.state, "done");
    assert.equal(recovered.list()[0]!.saved_id, saved.id);
    assert.equal(library.inbox().length, 1);
    assert.equal(library.inbox()[0]!.revision, saved.revision);
    assert.equal(library.current("sum"), null);
  } finally {
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

function scriptedContext(
  reply: (n: number, context: TranscriptContext) => AssistantMessage["content"],
) {
  let requests = 0;
  const notices: { message: string; type: string }[] = [];
  const provider = {
    baseUrl: "http://unused.invalid",
    apiKey: "fixture-key",
    api: "openai-completions",
    models: [
      {
        id: "test-model",
        name: "Test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 2000,
      },
    ],
    streamSimple: (_model: unknown, context: TranscriptContext) => {
      const content = reply(++requests, context);
      const message: AssistantMessage = {
        role: "assistant",
        api: "openai-completions",
        provider: "atac-fixture",
        model: "test-model",
        timestamp: Date.now(),
        stopReason: content.some((c) => c.type === "toolCall")
          ? "toolUse"
          : "stop",
        content,
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        stream.push({
          type: "done",
          reason: message.stopReason as "stop" | "toolUse",
          message,
        });
        stream.end();
      });
      return stream;
    },
  };
  return {
    notices,
    ctx: {
      hasUI: true,
      ui: {
        notify: (message: string, type: string) =>
          notices.push({ message, type }),
      },
      model: { provider: "atac-fixture", id: "test-model" },
      modelRegistry: {
        getRegisteredNativeProvider: () => undefined,
        getRegisteredProviderConfig: () => provider,
      },
    } as unknown as ExtensionContext,
    requests: () => requests,
  };
}

test("analysis stops at eight responses instead of looping or retrying", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-budget-"));
  const lib = new Library(root);
  const jobs = new Jobs(lib, DEFAULT_LIMITS);
  const script = scriptedContext((n) => [
    {
      type: "toolCall",
      id: `search-${n}`,
      name: "atac_search",
      arguments: { query: "repeat" },
    },
  ]);
  try {
    await jobs.enqueue(
      {
        source: {
          cwd: root,
          session_id: "s",
          request_id: "r",
          goal: "repeated task",
        },
        messages: [],
        calls: [],
        tools: [],
        truncated: false,
      },
      script.ctx,
    );
    await jobs.waitForIdle();
    assert.equal(script.requests(), 8);
    assert.equal(jobs.list()[0]!.state, "failed");
    assert.match(jobs.list()[0]!.diagnostic!, /8 model responses/);
    assert.equal(lib.inbox().length, 0);
    assert.deepEqual(script.notices, [
      { message: "ATaC: Program extraction started.", type: "info" },
      {
        message:
          "ATaC: Program extraction failed. See /atac:inbox for details.",
        type: "error",
      },
    ]);
  } finally {
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed candidate revision resets verification and never automatically runs tests", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-revise-"));
  const lib = new Library(root);
  const jobs = new Jobs(lib, DEFAULT_LIMITS);
  const source = { cwd: root, session_id: "s", request_id: "r", goal: "sum" };
  const asset: Bundle = {
    manifest: {
      program_id: "sum",
      name: "sum",
      purpose: "sum",
      when_to_use: "sum",
      tags: [],
      input_schema: { type: "array" },
      output_schema: { type: "number" },
      tools: [],
      test_tools: [],
      side_effects: "none",
    },
    main: "return inputs.reduce((a,b)=>a+b,0);",
    tests: "await check.equal(await run([2,3]),6);",
  };
  const fixed = { ...asset, tests: "await check.equal(await run([2,3]),5);" };
  const script = scriptedContext((n) =>
    n === 1
      ? [
          {
            type: "toolCall",
            id: "revise",
            name: "atac_save",
            arguments: JSON.parse(JSON.stringify(fixed)),
          },
        ]
      : [{ type: "text", text: "Revised" }],
  );
  try {
    const c = await lib.save(asset, source);
    const claim = await lib.claim(c.id, c.revision);
    const report = await testProgram(asset, {
      tools: [],
      executeTool: async () => {
        throw new Error("Unexpected tool");
      },
    });
    assert.equal((await lib.finish(claim, report)).status, "failed");
    const revising = await lib.change(c.id, c.revision, (record) => {
      record.status = "revising";
      record.owner_pid = process.pid;
    });
    await jobs.enqueue(
      {
        source,
        messages: [],
        calls: [{ type: "tool_result", name: "read" }],
        tools: [],
        truncated: false,
      },
      script.ctx,
      revising,
      "Fix assertion",
    );
    await jobs.waitForIdle();
    const updated = lib.candidate(c.id);
    assert.equal(updated.status, "untested");
    assert.notEqual(updated.revision, c.revision);
    assert.deepEqual(updated.history, [c.revision]);
    assert.equal(updated.report_id, undefined);
    assert.equal(lib.current("sum"), null);
    assert.deepEqual(script.notices, [
      { message: "ATaC: Program revision started.", type: "info" },
      {
        message: "ATaC: Program revised. Open /atac:inbox to review.",
        type: "info",
      },
    ]);
  } finally {
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("analysis reports no candidate and keeps noninteractive sessions quiet", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-notice-"));
  const lib = new Library(root);
  const jobs = new Jobs(lib, DEFAULT_LIMITS);
  const script = scriptedContext(() => [
    { type: "text", text: "No reusable work" },
  ]);
  const snapshot: Snapshot = {
    source: { cwd: root, session_id: "s", request_id: "one", goal: "one-off" },
    messages: [],
    calls: [],
    tools: [],
    truncated: false,
  };
  try {
    await jobs.enqueue(snapshot, script.ctx);
    await jobs.waitForIdle();
    assert.deepEqual(script.notices, [
      { message: "ATaC: Program extraction started.", type: "info" },
      { message: "ATaC: No reusable program found.", type: "info" },
    ]);
    await jobs.enqueue(
      { ...snapshot, source: { ...snapshot.source, request_id: "two" } },
      { ...script.ctx, hasUI: false },
    );
    await jobs.waitForIdle();
    assert.equal(script.requests(), 2);
    assert.equal(script.notices.length, 2);
    assert.equal(lib.inbox().length, 0);
  } finally {
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("analysis receives current published and Inbox programs before making a save decision", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-catalog-"));
  const lib = new Library(root);
  const jobs = new Jobs(lib, DEFAULT_LIMITS);
  const source = {
    cwd: root,
    session_id: "catalog",
    request_id: "one",
    goal: "Add numbers",
  };
  const asset: Bundle = {
    manifest: {
      program_id: "sum",
      name: "Sum values",
      purpose: "Add numbers",
      when_to_use: "Repeated sums",
      tags: ["math"],
      tools: [],
      test_tools: [],
      side_effects: "None",
      input_schema: true,
      output_schema: true,
    },
    main: "return inputs.reduce((a,b) => a+b, 0);",
    tests: "await check.equal(await run([2,3]), 5);",
  };
  try {
    const c = await lib.save(asset, source);
    const claim = await lib.claim(c.id, c.revision);
    await lib.finish(
      claim,
      await testProgram(asset, {
        tools: [],
        executeTool: async () => {
          throw new Error("Unexpected tool");
        },
      }),
    );
    let pending = await lib.save(
      { ...asset, main: asset.main + "\n// pending improvement" },
      source,
    );
    const archived = await lib.save(
      {
        ...asset,
        manifest: { ...asset.manifest, program_id: "old-sum", name: "Old sum" },
      },
      source,
    );
    await lib.change(archived.id, archived.revision, (record) => {
      record.status = "archived";
    });
    const script = scriptedContext((n, context) => {
      const user = context.messages.find((m) => m.role === "user");
      assert.ok(user && user.role === "user");
      const input = JSON.parse(
        typeof user.content === "string"
          ? user.content
          : user.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join(""),
      );
      const catalog = input.existing_programs;
      assert.equal(catalog.published.length, 1);
      assert.equal(catalog.published[0].program_id, "sum");
      assert.equal(catalog.published[0].name, "Sum values");
      assert.equal(catalog.published[0].purpose, "Add numbers");
      assert.equal(catalog.published[0].when_to_use, "Repeated sums");
      assert.equal(catalog.published[0].revision, c.revision);
      assert.equal(catalog.inbox.length, 2);
      const update = catalog.inbox.find(
        (item: { candidate_id: string }) => item.candidate_id === pending.id,
      );
      assert.equal(update.status, "untested");
      assert.equal(update.base_version, c.revision);
      assert.equal(update.revision, pending.revision);
      assert.equal(update.name, n === 1 ? "Sum values" : "Updated sum");
      assert.equal(
        catalog.inbox.find(
          (item: { candidate_id: string }) => item.candidate_id === archived.id,
        ).status,
        "archived",
      );
      assert.match(
        JSON.stringify(context.messages.filter((m) => m.role === "system")),
        /Different paths, inputs, titles or equivalent implementations are not new capabilities/,
      );
      return [
        { type: "text", text: "Already covered by sum. No candidate needed." },
      ];
    });
    const snapshot = {
      source,
      messages: [],
      calls: [],
      tools: [],
      truncated: false,
    };
    await jobs.enqueue(snapshot, script.ctx);
    await jobs.waitForIdle();
    pending = await lib.save(
      { ...asset, manifest: { ...asset.manifest, name: "Updated sum" } },
      source,
      { id: pending.id, expected_revision: pending.revision },
    );
    await jobs.enqueue(
      { ...snapshot, source: { ...source, request_id: "two" } },
      script.ctx,
    );
    await jobs.waitForIdle();
    assert.equal(script.requests(), 2);
    assert.ok(
      jobs.list().every((job) => job.state === "done"),
      JSON.stringify(jobs.list().map((job) => job.diagnostic)),
    );
    assert.ok(jobs.list().every((job) => !job.saved_id));
    assert.equal(lib.inbox(true).length, 3);
  } finally {
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
