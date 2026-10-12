import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SessionManager,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  TASK_ENTRY,
  batchSnapshot,
  completedTasks,
} from "../src/harvest/batch.js";
import { Jobs } from "../src/harvest/jobs.js";
import type { Snapshot } from "../src/harvest/snapshot.js";
import { Library, atomicJson } from "../src/library/storage.js";
import { DEFAULT_LIMITS } from "../src/runtime/runner.js";
import { setPermissions } from "../src/config.js";
import { scriptedContext } from "./scripted-model.js";
import { ActivityWidget } from "../src/pi/activity.js";

const task = (root: string, id: string): Snapshot => ({
  source: {
    cwd: root,
    session_id: "session",
    request_id: id,
    goal: `Task ${id}`,
  },
  message_ids: [id, `${id}-done`],
  messages: [{ id, text: `Work ${id}` }],
  calls: [],
  tools: [],
  truncated: false,
});
function save(id: string): AssistantMessage["content"] {
  return [
    {
      type: "toolCall",
      name: "atac_save",
      id,
      arguments: {
        manifest: {
          program_id: id,
          purpose: id,
          when_to_use: id,
          tags: [],
          input_schema: {},
          output_schema: {},
          tools: [],
          test_tools: [],
          side_effects: "none",
        },
        main: "return inputs;",
        tests: "await check.equal(await run(1), 1);",
      },
    },
  ];
}
const done: AssistantMessage["content"] = [{ type: "text", text: "Finished" }];

async function fixture(
  t: TestContext,
  reply: Parameters<typeof scriptedContext>[0],
  ready?: Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), "atac-batch-"));
  const lib = new Library(root);
  const script = scriptedContext(reply, ready);
  const activity = new ActivityWidget();
  const jobs = new Jobs(lib, DEFAULT_LIMITS, undefined, undefined, activity);
  t.after(async () => {
    activity.dispose();
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  });
  await setPermissions(lib, "on-demand");
  return { root, lib, jobs, script };
}

test("manual extraction merges tasks, saves multiple programs, and consumes coverage once", async (t) => {
  const f = await fixture(t, (n, ctx) => {
    if (n === 1) {
      const request = ctx.messages.findLast((m) => m.role === "user")!;
      assert.match(JSON.stringify(request), /Task one/);
      assert.match(JSON.stringify(request), /Task two/);
    }
    return n === 1 ? save("first") : n === 2 ? save("second") : done;
  });
  const tasks = [task(f.root, "one"), task(f.root, "two")];
  assert.equal(await f.jobs.enqueue(tasks[0]!, f.script.ctx), false);
  assert.equal(f.script.requests(), 0);
  assert.deepEqual(
    (
      await Promise.all([
        f.jobs.enqueue(tasks, f.script.ctx),
        f.jobs.enqueue(tasks, f.script.ctx),
      ])
    ).sort(),
    [false, true],
  );
  await f.jobs.waitForIdle();
  assert.equal(f.jobs.list().length, 1);
  assert.equal(f.jobs.list()[0]!.state, "done", f.jobs.list()[0]!.diagnostic);
  assert.equal(f.jobs.list()[0]!.saved_ids?.length, 2);
  assert.deepEqual(
    f.lib
      .inbox()
      .map((c) => c.program_id)
      .sort(),
    ["first", "second"],
  );
  assert.ok(f.lib.inbox().every((c) => c.status === "untested"));
  assert.equal(await f.jobs.enqueue(tasks, f.script.ctx), false);
  assert.deepEqual(
    f.script.notices.map((n) => n.message),
    ["ATaC: Saved first to Inbox.", "ATaC: Saved second to Inbox."],
  );
  assert.equal(f.script.widgets.at(-1), undefined);
});

test("failed partial batches can retry without duplicating a saved program", async (t) => {
  const f = await fixture(t, (n) => {
    if (n === 2) throw new Error("Provider unavailable");
    return n === 1 || n === 3 ? save("first") : n === 4 ? save("second") : done;
  });
  const tasks = [task(f.root, "one")];
  await f.jobs.enqueue(tasks, f.script.ctx);
  await f.jobs.waitForIdle();
  assert.equal(f.jobs.list()[0]!.state, "failed");
  assert.equal(f.lib.inbox().length, 1);
  assert.equal(await f.jobs.enqueue(tasks, f.script.ctx), true);
  await f.jobs.waitForIdle();
  assert.equal(f.lib.inbox().length, 2);
  assert.equal(f.jobs.list().at(-1)!.state, "done");
  assert.equal(f.script.notices.filter((n) => n.type === "error").length, 1);
  assert.equal(
    f.script.notices.filter((n) => n.message === "ATaC: Saved first to Inbox.")
      .length,
    1,
  );
});

test("no-result batches consume only their original coverage and can be restored", async (t) => {
  const f = await fixture(t, () => done);
  const first = task(f.root, "one");
  await f.jobs.enqueue([first], f.script.ctx);
  await f.jobs.waitForIdle();
  assert.deepEqual(f.script.notices, []);
  const restored = new Jobs(f.lib, DEFAULT_LIMITS);
  try {
    assert.equal(await restored.enqueue([first], f.script.ctx), false);
    assert.equal(
      await restored.enqueue([first, task(f.root, "two")], f.script.ctx),
      true,
    );
    await restored.waitForIdle();
    assert.equal(restored.list().at(-1)!.snapshot.tasks?.length, 1);
    assert.equal(
      restored.list().at(-1)!.snapshot.tasks?.[0]?.source.request_id,
      "two",
    );
  } finally {
    await restored.stop();
  }
});

test("permission changes cancel queued auto extraction, retain running work, and never replay on re-enable", async (t) => {
  let started!: () => void, release!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await fixture(
    t,
    () => {
      started();
      return done;
    },
    ready,
  );
  t.after(release);
  await setPermissions(f.lib, "manual");
  const running = task(f.root, "running"),
    queued = task(f.root, "queued");
  await f.jobs.enqueue(running, f.script.ctx);
  await began;
  await f.jobs.enqueue(queued, f.script.ctx);
  await setPermissions(new Library(f.root), "on-demand");
  const deadline = Date.now() + 3000;
  while (
    f.jobs.list().find((j) => j.snapshot.source.request_id === "queued")!
      .state === "queued" &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    f.jobs.list().find((j) => j.snapshot.source.request_id === "queued")!.state,
    "failed",
  );
  release();
  await f.jobs.waitForIdle();
  assert.equal(
    f.jobs.list().find((j) => j.snapshot.source.request_id === "running")!
      .state,
    "done",
  );
  await setPermissions(f.lib, "manual");
  f.jobs.start(f.script.ctx);
  await f.jobs.waitForIdle();
  assert.equal(f.script.requests(), 1);
  assert.equal(await f.jobs.enqueue([running, queued], f.script.ctx), true);
  await f.jobs.waitForIdle();
});

test("batch input preserves every goal, divides excerpt budget, and redacts secrets", () => {
  const tasks = [task("/tmp", "one"), task("/tmp", "two")];
  tasks[0]!.messages = ["secret=veryprivate " + "x".repeat(10000)];
  tasks[1]!.messages = ["y".repeat(10000)];
  const batch = batchSnapshot(tasks, 2000);
  assert.ok(JSON.stringify(batch).length <= 2000);
  assert.equal(batch.tasks?.length, 2);
  assert.ok(batch.tasks?.every((t) => t.text.length > 100 && t.truncated));
  assert.doesNotMatch(JSON.stringify(batch), /veryprivate/);
  assert.deepEqual(
    batch.tasks?.map((t) => t.source.goal),
    ["Task one", "Task two"],
  );
  assert.throws(() => batchSnapshot(tasks, 10), /No work was marked/);
});

function assistant(): AssistantMessage {
  return {
    role: "assistant",
    content: done,
    api: "openai-completions",
    provider: "fixture",
    model: "fixture",
    timestamp: 1,
    stopReason: "stop",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

test("session tasks survive custom entries, isolate branches, and reconstruct older work", () => {
  const manager = SessionManager.inMemory("/tmp");
  const ctx = {
    cwd: "/tmp",
    sessionManager: manager,
  } as unknown as ExtensionContext;
  const old = manager.appendMessage({
    role: "user",
    content: "Old work",
    timestamp: 0,
  });
  const end = manager.appendMessage(assistant());
  const request = manager.appendMessage({
    role: "user",
    content: "New work",
    timestamp: 2,
  });
  const last = manager.appendMessage(assistant());
  const stored = {
    ...task("/tmp", request),
    message_ids: [request, last],
    calls: [{ name: "nested-tool", parent: "codemode", text: "nested trace" }],
  };
  manager.appendCustomEntry(TASK_ENTRY, stored);
  const tasks = completedTasks(ctx, []);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]!.source.request_id, old);
  assert.match(JSON.stringify(tasks[1]!.calls), /nested trace/);
  assert.doesNotMatch(
    JSON.stringify(manager.buildSessionContext().messages),
    /nested trace/,
  );
  manager.branch(end);
  assert.deepEqual(
    completedTasks(ctx, []).map((t) => t.source.request_id),
    [old],
  );
  manager.appendMessage({ role: "user", content: "Unfinished", timestamp: 3 });
  assert.equal(completedTasks(ctx, []).length, 1);
});

test("automatic and manual extraction cannot claim overlapping source work", async (t) => {
  const f = await fixture(t, () => done);
  await setPermissions(f.lib, "manual");
  const first = task(f.root, "first"),
    second = task(f.root, "second");
  await f.jobs.enqueue(first, f.script.ctx);
  assert.equal(await f.jobs.enqueue([first, second], f.script.ctx), true);
  await f.jobs.waitForIdle();
  const jobs = f.jobs.list();
  assert.equal(jobs.length, 2);
  assert.equal(
    jobs.find((j) => j.trigger === "manual")!.snapshot.tasks?.length,
    1,
  );
  assert.equal(
    jobs.find((j) => j.trigger === "manual")!.snapshot.tasks?.[0]?.source
      .request_id,
    "second",
  );
  assert.equal(await f.jobs.enqueue(second, f.script.ctx), false);
});

test("manual extraction stops on shutdown and requires an explicit retry", async (t) => {
  let f: Awaited<ReturnType<typeof fixture>>;
  f = await fixture(t, () => {
    void f.jobs.stop();
    return done;
  });
  const tasks = [task(f.root, "first")];
  await f.jobs.enqueue(tasks, f.script.ctx);
  await f.jobs.waitForIdle();
  assert.equal(f.jobs.list()[0]!.state, "failed");
  assert.equal(f.script.widgets.at(-1), undefined);
  assert.deepEqual(f.script.notices, []);
  const retry = scriptedContext(() => done);
  const restored = new Jobs(f.lib, DEFAULT_LIMITS);
  try {
    restored.start(retry.ctx);
    await restored.waitForIdle();
    assert.equal(retry.requests(), 0);
    assert.equal(await restored.enqueue(tasks, retry.ctx), true);
    await restored.waitForIdle();
    assert.equal(retry.requests(), 1);
  } finally {
    await restored.stop();
  }
});

test("abandoned batches release their coverage without automatic replay", async (t) => {
  const f = await fixture(t, () => done);
  const snapshot = task(f.root, "old");
  atomicJson(join(f.root, "jobs", "12345678.json"), {
    id: "12345678",
    kind: "harvest",
    trigger: "manual",
    state: "running",
    owner_pid: 2147483647,
    created_at: new Date().toISOString(),
    snapshot: batchSnapshot([snapshot]),
    coverage: [{ session_id: "session", message_ids: snapshot.message_ids }],
    model: { provider: "fixture", id: "model" },
  });
  assert.equal(await f.jobs.enqueue([snapshot], f.script.ctx), true);
  await f.jobs.waitForIdle();
  assert.equal(f.jobs.list().find((j) => j.id === "12345678")!.state, "failed");
  assert.equal(f.script.requests(), 1);
});

test("on-demand recovery never resumes a crashed automatic extraction", async (t) => {
  const f = await fixture(t, () => done);
  const snapshot = task(f.root, "crashed-auto");
  atomicJson(join(f.root, "jobs", "12345678.json"), {
    id: "12345678",
    kind: "harvest",
    state: "running",
    owner_pid: 2147483647,
    created_at: new Date().toISOString(),
    snapshot,
    model: { provider: "fixture", id: "model" },
  });
  f.jobs.start(f.script.ctx);
  await f.jobs.waitForIdle();
  assert.equal(f.script.requests(), 0);
  assert.equal(f.jobs.list()[0]!.state, "failed");
  await f.jobs.enqueue([snapshot], { ...f.script.ctx, hasUI: false });
  await f.jobs.waitForIdle();
  assert.equal(f.script.requests(), 1);
  assert.deepEqual(f.script.notices, []);
  assert.deepEqual(f.script.widgets, []);
});
