import { ActivityWidget } from "../src/pi/activity.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type {
  ExtensionFactory,
  ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import { Library, atomicJson, readJson } from "../src/library/storage.js";
import type { Bundle, Candidate, Report } from "../src/library/program.js";
import {
  setPermissions,
  authorizeAutomatic,
  loadConfig,
} from "../src/config.js";
import {
  AutomaticPublishing,
  automaticRuns,
} from "../src/runtime/automation.js";
import { verifyCandidate } from "../src/runtime/verification.js";
import { DEFAULT_LIMITS, testProgram } from "../src/runtime/runner.js";
import { Jobs } from "../src/harvest/jobs.js";
import { programTools } from "../src/pi/tools.js";
import { programPrompt } from "../src/pi/prompt.js";
import { detailTabs } from "../src/pi/detail.js";
import { scriptedContext } from "./scripted-model.js";

const bundle: Bundle = {
  manifest: {
    program_id: "sum",
    purpose: "Add numbers",
    when_to_use: "Repeated sums",
    tags: [],
    input_schema: { type: "array", items: { type: "number" } },
    output_schema: { type: "number" },
    tools: [],
    test_tools: [],
    side_effects: "None",
  },
  main: "return inputs.reduce((a,b) => a+b,0);",
  tests: "await check.equal(await run([2,3]),5);",
};
const wrong = { ...bundle, main: "return 0;" };
function fixture(
  reply: (
    n: number,
    context: TranscriptContext,
  ) => AssistantMessage["content"] = () => [
    { type: "text", text: "No changes" },
  ],
  factories: ExtensionFactory[] = [],
) {
  const root = mkdtempSync(join(tmpdir(), "atac-auto-"));
  const agentDir = join(root, "agent");
  mkdirSync(agentDir);
  const lib = new Library(join(root, "library"));
  const script = scriptedContext(reply);
  let idle = true;
  const ctx = Object.assign(script.ctx, {
    cwd: root,
    mode: "rpc",
    isIdle: () => idle,
    isProjectTrusted: () => false,
    sessionManager: {
      getBranch: () => [],
      getSessionId: () => "s",
      getLeafId: () => "r",
    },
  }) as unknown as ExtensionToolContext;
  const source = {
    cwd: root,
    session_id: "s",
    request_id: "r",
    goal: "Add numbers",
  };
  const verify: typeof verifyCandidate = (
    lib,
    c,
    ctx,
    signal,
    limits,
    options,
  ) =>
    verifyCandidate(lib, c, ctx, signal, limits, {
      ...options,
      agentDir,
      factories,
      mcp: { loadConfig: () => ({ servers: [], errors: [] }) },
    });
  let automatic: AutomaticPublishing;
  const activity = new ActivityWidget();
  const jobs = new Jobs(
    lib,
    DEFAULT_LIMITS,
    (c, ctx) => automatic.saved(c, ctx),
    undefined,
    activity,
  );
  automatic = new AutomaticPublishing(
    lib,
    (...args) => jobs.repair(...args),
    verify,
    activity,
  );
  const saveTool = programTools(lib, DEFAULT_LIMITS, automatic.saved).find(
    (t) => t.name === "atac_save",
  )!;
  return {
    root,
    lib,
    ctx,
    source,
    script,
    jobs,
    automatic,
    verify,
    setIdle: (value: boolean) => {
      idle = value;
    },
    async save(asset = bundle, candidate?: Candidate) {
      const response = await saveTool.execute(
        "save",
        {
          ...asset,
          ...(candidate
            ? {
                candidate_id: candidate.id,
                expected_revision: candidate.revision,
              }
            : {}),
        },
        new AbortController().signal,
        undefined,
        ctx,
      );
      const saved = JSON.parse((response.content[0] as { text: string }).text);
      return lib.candidate(saved.candidate_id);
    },
    async close() {
      activity.dispose();
      await automatic.stop();
      await jobs.stop();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function saveReply(asset: Bundle): AssistantMessage["content"] {
  return [
    {
      type: "toolCall",
      id: `save-${asset.main}`,
      name: "atac_save",
      arguments: JSON.parse(JSON.stringify(asset)),
    },
  ];
}
function inputOf(context: TranscriptContext) {
  const message = context.messages.find((m) => m.role === "user")!;
  return JSON.parse(
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
  );
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!predicate() && Date.now() < deadline) await delay(20);
  assert.ok(predicate(), "condition did not complete");
}

test("manual is the default; enabling auto leaves history alone and save waits for the parent to idle", async () => {
  const f = fixture();
  try {
    const old = await f.save(wrong);
    assert.equal(loadConfig(f.lib.root).permissions, "manual");
    assert.equal(automaticRuns(f.lib.root).length, 0);
    await setPermissions(f.lib, "auto");
    await f.automatic.waitForIdle();
    assert.equal(f.lib.candidate(old.id).status, "untested");
    f.setIdle(false);
    const updated = await f.save(bundle, old);
    assert.equal(updated.status, "untested");
    await delay(150);
    assert.equal(automaticRuns(f.lib.root)[0]!.state, "queued");
    await f.save(bundle, updated);
    assert.equal(
      automaticRuns(f.lib.root).length,
      1,
      "unchanged saves must not create another chain",
    );
    f.setIdle(true);
    await f.automatic.waitForIdle();
    assert.equal(f.lib.candidate(old.id).status, "published");
    assert.equal(automaticRuns(f.lib.root)[0]!.attempts.length, 1);
    assert.equal(f.script.requests(), 0);
    assert.match(programPrompt(f.lib), /Publishing mode: auto/);
    assert.match(programPrompt(f.lib), /"program_id":"sum"/);
    assert.match(
      detailTabs(f.lib, f.lib.candidate(old.id)).find(
        (t) => t.title === "Report",
      )!.text,
      /Tests: 1\/3 · Repairs: 0\/2/,
    );
    assert.ok(
      f.script.notices.some((n) => n.message === "ATaC: Published sum."),
    );
  } finally {
    await f.close();
  }
});

test("a real analysis session repairs the same candidate, preserves history, and publishes through independent verification", async () => {
  const f = fixture((n, context) => {
    if (n === 1) {
      const input = inputOf(context);
      assert.equal(
        input.snapshot.source.goal,
        "Manually saved from pi session",
      );
      assert.equal(input.revision.bundle.main, wrong.main);
      assert.match(input.revision.instruction, /Preserve the original task/);
      assert.match(input.revision.instruction, /"failure_kind":"program"/);
      assert.equal(input.existing_programs.inbox[0].program_id, "sum");
      assert.deepEqual(
        context.messages
          .flatMap((m) => (m.role === "system" ? (m.toolsAdded ?? []) : []))
          .map((t) => t.name)
          .sort(),
        ["atac_get", "atac_save", "atac_search"],
      );
      return saveReply(bundle);
    }
    return [{ type: "text", text: "Fixed addition" }];
  });
  try {
    await setPermissions(f.lib, "auto");
    const initial = await f.save(wrong);
    await f.automatic.waitForIdle();
    const c = f.lib.candidate(initial.id);
    assert.equal(
      c.status,
      "published",
      JSON.stringify(automaticRuns(f.lib.root)),
    );
    assert.equal(c.program_id, initial.program_id);
    assert.deepEqual(c.history, [initial.revision]);
    const runs = automaticRuns(f.lib.root);
    assert.equal(runs.length, 1, "repair must not schedule a new chain");
    assert.equal(runs[0]!.repairs, 1);
    assert.deepEqual(
      runs[0]!.attempts.map((a) => a.status),
      ["failed", "published"],
    );
    assert.equal(f.jobs.list()[0]!.automatic_chain, runs[0]!.id);
    assert.deepEqual(f.script.notices, [
      { message: "ATaC: Published sum.", type: "info" },
    ]);
    assert.ok(
      f.script.widgets.some(
        (lines) =>
          lines?.[0] === "ATaC  Repairing sum" &&
          lines[1] === "      Round 1 of 2    Elapsed 0s",
      ),
    );
    assert.ok(
      f.script.widgets.some(
        (lines) =>
          lines?.[0] === "ATaC  Testing sum" &&
          lines[1]?.startsWith("      Attempt 2 of 3"),
      ),
    );
    assert.equal(f.script.widgets.at(-1), undefined);
    assert.ok(
      f.script.widgets.every((lines) => !lines?.join("").includes("·")),
    );
  } finally {
    await f.close();
  }
});

test("three failures consume exactly two repairs and keep the previous published version", async () => {
  const f = fixture((n) =>
    n % 2
      ? saveReply({ ...wrong, main: `return ${n};` })
      : [{ type: "text", text: "Saved" }],
  );
  try {
    const original = await f.save();
    await f.verify(
      f.lib,
      original,
      f.ctx,
      new AbortController().signal,
      DEFAULT_LIMITS,
    );
    await setPermissions(f.lib, "auto");
    const c = await f.save(wrong);
    await f.automatic.waitForIdle();
    assert.equal(f.lib.candidate(c.id).status, "failed");
    const run = automaticRuns(f.lib.root)[0]!;
    assert.equal(run.attempts.length, 3);
    assert.equal(run.repairs, 2);
    assert.equal(run.state, "failed");
    assert.deepEqual(f.script.notices, [
      { message: "ATaC: sum needs review. Open /atac:inbox.", type: "error" },
    ]);
    assert.equal(f.script.widgets.at(-1), undefined);
    assert.equal(f.script.requests(), 4);
    assert.equal(f.lib.current("sum"), original.revision);
    assert.equal(automaticRuns(f.lib.root).length, 1);
  } finally {
    await f.close();
  }
});

for (const kind of [
  "unchanged",
  "repeated",
  "no save",
  "model error",
] as const) {
  test(`automatic repair stops after ${kind}`, async () => {
    const f = fixture((n) => {
      if (kind === "model error") throw new Error("fixture model unavailable");
      if (kind === "no save") return [{ type: "text", text: "Cannot repair" }];
      if (!(n % 2)) return [{ type: "text", text: "Saved" }];
      return saveReply(
        kind === "repeated" && n === 1
          ? { ...wrong, main: "return 1;" }
          : wrong,
      );
    });
    try {
      await setPermissions(f.lib, "auto");
      const c = await f.save(wrong);
      await f.automatic.waitForIdle();
      const run = automaticRuns(f.lib.root)[0]!;
      assert.equal(run.state, "failed");
      assert.equal(run.attempts.length, kind === "repeated" ? 2 : 1);
      assert.equal(f.lib.current("sum"), null);
      assert.notEqual(f.lib.candidate(c.id).status, "revising");
      assert.ok(run.diagnostic);
      assert.deepEqual(f.script.notices, [
        { message: "ATaC: sum needs review. Open /atac:inbox.", type: "error" },
      ]);
      assert.equal(f.script.widgets.at(-1), undefined);
    } finally {
      await f.close();
    }
  });
}

test("background extraction and user-requested revision both schedule automatic verification", async () => {
  let asset = bundle;
  const f = fixture((n) =>
    n % 2 ? saveReply(asset) : [{ type: "text", text: "Saved" }],
  );
  try {
    await setPermissions(f.lib, "auto");
    const snapshot = {
      source: f.source,
      messages: [],
      calls: [],
      tools: [],
      truncated: false,
    };
    await f.jobs.enqueue(snapshot, f.ctx);
    await f.jobs.waitForIdle();
    await f.automatic.waitForIdle();
    assert.equal(f.lib.inbox(true)[0]!.status, "published");
    // A candidate created in manual mode is later revised explicitly in auto mode.
    await setPermissions(f.lib, "manual");
    const old = await f.save(wrong);
    await setPermissions(f.lib, "auto");
    asset = { ...bundle, main: bundle.main + "\n// revised" };
    const revising = await f.lib.change(old.id, old.revision, (c) => {
      c.status = "revising";
      c.owner_pid = process.pid;
    });
    await f.jobs.enqueue(snapshot, f.ctx, revising, "Fix sum");
    await f.jobs.waitForIdle();
    await f.automatic.waitForIdle();
    assert.equal(f.lib.candidate(old.id).status, "published");
    assert.equal(automaticRuns(f.lib.root).length, 2);
    assert.ok(
      f.script.notices.every(
        (n) => !/Open \/atac:inbox to review/.test(n.message),
      ),
    );
  } finally {
    await f.close();
  }
});

for (const kind of ["denied", "tool error", "missing tool"] as const) {
  test(`${kind} stops without automatic repair, preserving pi permission prompts`, async () => {
    let confirmations = 0;
    const f = fixture(undefined, [
      (pi) => {
        pi.on("tool_call", async (event, ctx) => {
          if (event.toolName === "read" && kind === "denied") {
            if (!(await ctx.ui.confirm("Read file?", "Allow read")))
              return { block: true, reason: "Permission denied" };
          }
        });
      },
    ]);
    f.ctx.ui.confirm = async () => {
      confirmations++;
      return false;
    };
    try {
      await setPermissions(f.lib, "auto");
      await f.save({
        ...bundle,
        manifest: {
          ...bundle.manifest,
          tools: [kind === "missing tool" ? "absent_tool" : "read"],
        },
        main:
          kind === "missing tool"
            ? "return await tools.absent_tool({});"
            : "return await tools.read({path: 'does-not-exist'});",
      });
      await f.automatic.waitForIdle();
      const run = automaticRuns(f.lib.root)[0]!;
      assert.equal(run.repairs, 0);
      assert.equal(run.attempts.length, 1);
      assert.equal(f.script.requests(), 0);
      const report = readJson<Report>(
        join(f.lib.root, "reports", `${run.attempts[0]!.report_id}.json`),
      )!;
      assert.equal(
        report.failure_kind,
        kind === "missing tool" ? "environment" : "tool",
      );
      assert.equal(confirmations, kind === "denied" ? 1 : 0);
    } finally {
      await f.close();
    }
  });
}

test("off then on revokes old authorization inside the publication lock; manual testing is unaffected", async () => {
  const f = fixture();
  try {
    const c = await f.save();
    const config = await setPermissions(f.lib, "auto");
    const authorize = () =>
      authorizeAutomatic(f.lib.root, config.permissionVersion!);
    const claim = await f.lib.claim(c.id, c.revision, authorize);
    const report = await testProgram(bundle, {
      tools: [],
      executeTool: async () => {
        throw new Error("Unexpected tool");
      },
    });
    assert.equal(report.ok, true);
    const otherSession = new Library(f.lib.root);
    await setPermissions(otherSession, "manual");
    await setPermissions(otherSession, "auto");
    const done = await f.lib.finish(claim, report, undefined, authorize);
    assert.equal(done.status, "interrupted");
    assert.equal(f.lib.current("sum"), null);
    const manual = await f.lib.claim(c.id, c.revision);
    await setPermissions(otherSession, "manual");
    const manualReport = await testProgram(bundle, {
      tools: [],
      executeTool: async () => {
        throw new Error("Unexpected tool");
      },
    });
    assert.equal(
      (await f.lib.finish(manual, manualReport)).status,
      "published",
    );
  } finally {
    await f.close();
  }
});

test("cross-session permission changes cancel an active verification and never replay on re-enable", async () => {
  const f = fixture();
  try {
    await setPermissions(f.lib, "auto");
    const c = await f.save({ ...bundle, tests: "while(true) {}" });
    await until(() => f.lib.candidate(c.id).status === "testing");
    await setPermissions(new Library(f.lib.root), "manual");
    await f.automatic.waitForIdle();
    assert.equal(automaticRuns(f.lib.root)[0]!.state, "interrupted");
    assert.equal(f.lib.candidate(c.id).status, "interrupted");
    await setPermissions(f.lib, "auto");
    await delay(150);
    assert.equal(automaticRuns(f.lib.root)[0]!.attempts.length, 1);
    assert.equal(f.lib.current("sum"), null);
  } finally {
    await f.close();
  }
});

for (const action of [
  "archive",
  "manual test",
  "edit",
  "new input",
  "stop",
] as const) {
  test(`queued automatic work stops on ${action}`, async () => {
    const f = fixture();
    try {
      await setPermissions(f.lib, "auto");
      f.setIdle(false);
      const c = await f.save(wrong);
      if (action === "archive")
        await f.lib.change(c.id, c.revision, (c) => {
          c.status = "archived";
        });
      if (action === "manual test")
        await f.verify(
          f.lib,
          c,
          f.ctx,
          new AbortController().signal,
          DEFAULT_LIMITS,
        );
      if (action === "edit")
        await f.lib.save(bundle, f.source, {
          id: c.id,
          expected_revision: c.revision,
        });
      if (action === "new input") await f.automatic.cancel();
      if (action === "stop") await f.automatic.stop();
      f.setIdle(true);
      await f.automatic.waitForIdle();
      assert.equal(automaticRuns(f.lib.root)[0]!.attempts.length, 0);
      assert.equal(f.script.requests(), 0);
    } finally {
      await f.close();
    }
  });
}

test("automatic claims cannot retest a revision already claimed by a manual verifier", async () => {
  const f = fixture();
  try {
    const c = await f.save(wrong);
    await f.verify(
      f.lib,
      c,
      f.ctx,
      new AbortController().signal,
      DEFAULT_LIMITS,
    );
    await assert.rejects(
      f.verify(f.lib, c, f.ctx, new AbortController().signal, DEFAULT_LIMITS, {
        automatic: { chain_id: "race", attempt: 1, repairs: 0 },
      }),
      /already claimed or tested/,
    );
  } finally {
    await f.close();
  }
});

test("orphaned automatic chains and repair jobs are diagnosed, never replayed", async () => {
  const f = fixture();
  try {
    await setPermissions(f.lib, "auto");
    f.setIdle(false);
    await f.save(wrong);
    await f.automatic.stop();
    const run = automaticRuns(f.lib.root)[0]!;
    atomicJson(join(f.lib.root, "automation", `${run.id}.json`), {
      ...run,
      state: "testing",
      owner_pid: 2147483647,
    });
    atomicJson(join(f.lib.root, "jobs", "abcd.json"), {
      id: "abcd",
      kind: "revise",
      state: "queued",
      created_at: run.created_at,
      automatic_chain: run.id,
      owner_pid: 2147483647,
    });
    const restarted = new AutomaticPublishing(
      f.lib,
      async () => {
        throw new Error("Unexpected replay");
      },
      f.verify,
    );
    try {
      f.jobs.start(f.ctx);
      await f.jobs.waitForIdle();
      await restarted.waitForIdle();
      assert.equal(automaticRuns(f.lib.root)[0]!.state, "interrupted");
      assert.equal(f.jobs.list()[0]!.state, "failed");
      assert.equal(f.script.requests(), 0);
    } finally {
      await restarted.stop();
    }
  } finally {
    await f.close();
  }
});

for (const action of ["archive", "edit", "manual claim"] as const) {
  test(`active automatic verification stops when another session changes the candidate: ${action}`, async () => {
    const f = fixture();
    try {
      await setPermissions(f.lib, "auto");
      const c = await f.save({ ...bundle, tests: "while (true) {}" });
      await until(() => f.lib.candidate(c.id).status === "testing");
      const other = new Library(f.lib.root);
      if (action === "edit")
        await other.save(bundle, f.source, {
          id: c.id,
          expected_revision: c.revision,
        });
      else if (action === "archive")
        await other.change(c.id, c.revision, (c) => {
          c.status = "archived";
        });
      else {
        await assert.rejects(
          other.claim(c.id, c.revision),
          /Candidate is testing/,
        );
        await f.automatic.cancel();
      }
      await f.automatic.waitForIdle();
      assert.equal(f.lib.current("sum"), null);
      assert.equal(f.script.requests(), 0);
      assert.equal(
        f.lib.candidate(c.id).status,
        action === "edit"
          ? "untested"
          : action === "archive"
            ? "archived"
            : "interrupted",
      );
    } finally {
      await f.close();
    }
  });
}

test("new input cancels a running repair model without replaying the repair", async () => {
  const f = fixture(() => {
    void f.automatic.cancel("New user request");
    return saveReply(bundle);
  });
  try {
    await setPermissions(f.lib, "auto");
    const c = await f.save(wrong);
    await f.automatic.waitForIdle();
    const run = automaticRuns(f.lib.root)[0]!;
    assert.equal(run.state, "interrupted");
    assert.deepEqual(f.script.notices, []);
    assert.equal(f.script.widgets.at(-1), undefined);
    assert.ok(
      f.script.widgets.some((lines) => lines?.[0] === "ATaC  Repairing sum"),
    );
    assert.equal(run.attempts.length, 1);
    assert.equal(run.repairs, 1);
    assert.ok(f.jobs.list().every((j) => j.state === "failed"));
    assert.notEqual(f.lib.candidate(c.id).status, "revising");
    f.jobs.start(f.ctx);
    await f.jobs.waitForIdle();
    assert.equal(f.script.requests(), 1);
    assert.equal(f.lib.current("sum"), null);
  } finally {
    await f.close();
  }
});

test("automatic chains run serially and publication conflicts stop without repairs", async () => {
  const f = fixture();
  try {
    f.setIdle(false);
    await setPermissions(f.lib, "auto");
    const a = await f.save();
    const b = await f.save({
      ...bundle,
      main: bundle.main + "\n// another proposal",
    });
    assert.equal(automaticRuns(f.lib.root).length, 2);
    f.setIdle(true);
    await f.automatic.waitForIdle();
    assert.equal(f.lib.candidate(a.id).status, "published");
    assert.equal(f.lib.candidate(b.id).status, "failed");
    assert.equal(f.lib.current("sum"), a.revision);
    const run = automaticRuns(f.lib.root).find((r) => r.candidate_id === b.id)!;
    assert.equal(run.repairs, 0);
    assert.match(run.diagnostic!, /Publication conflict/);
    assert.equal(f.script.requests(), 0);
    const notices = f.script.notices.map((n) => n.message);
    assert.deepEqual(notices, [
      "ATaC: Published sum.",
      "ATaC: sum needs review. Open /atac:inbox.",
    ]);
    assert.deepEqual(
      f.script.widgets
        .map((lines) => lines?.[0])
        .filter(
          (title, index, titles) => index === 0 || title !== titles[index - 1],
        ),
      ["ATaC  Testing sum", undefined, "ATaC  Testing sum", undefined],
    );
  } finally {
    await f.close();
  }
});

for (const failure of ["javascript", "input", "output", "assertion"] as const) {
  test(`${failure} failure is eligible for automatic repair`, async () => {
    const asset = {
      ...bundle,
      ...(failure === "javascript" ? { main: "throw new Error('bug');" } : {}),
      ...(failure === "input"
        ? { tests: "await check.equal(await run('bad'),5);" }
        : {}),
      ...(failure === "output" ? { main: "return 'bad';" } : {}),
      ...(failure === "assertion"
        ? { tests: "await check.equal(await run([2,3]),6);" }
        : {}),
    };
    const f = fixture((n) =>
      n === 1 ? saveReply(bundle) : [{ type: "text", text: "Fixed" }],
    );
    try {
      await setPermissions(f.lib, "auto");
      const c = await f.save(asset);
      await f.automatic.waitForIdle();
      assert.equal(f.lib.candidate(c.id).status, "published");
      assert.equal(automaticRuns(f.lib.root)[0]!.repairs, 1);
    } finally {
      await f.close();
    }
  });
}

test("re-enabling automatic mode can queue new work while a revoked chain is still stopping", async () => {
  const f = fixture();
  await f.automatic.stop();
  let started = false;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const automatic = new AutomaticPublishing(
    f.lib,
    async () => {
      throw new Error("Unexpected repair");
    },
    async (...args) => {
      if (!started) {
        started = true;
        await barrier;
        args[3].throwIfAborted();
      }
      return f.verify(...args);
    },
  );
  try {
    await setPermissions(f.lib, "auto");
    const old = await f.lib.save(wrong, f.source, undefined, undefined, (c) =>
      automatic.saved(c, f.ctx),
    );
    await until(() => started);
    await setPermissions(f.lib, "manual");
    automatic.refresh();
    await setPermissions(f.lib, "auto");
    const fresh = await f.lib.save(
      { ...bundle, manifest: { ...bundle.manifest, program_id: "fresh-sum" } },
      f.source,
      undefined,
      undefined,
      (c) => automatic.saved(c, f.ctx),
    );
    automatic.refresh();
    release();
    await automatic.waitForIdle();
    assert.equal(
      automaticRuns(f.lib.root).find((r) => r.candidate_id === old.id)!.state,
      "interrupted",
    );
    assert.equal(f.lib.candidate(fresh.id).status, "published");
  } finally {
    release();
    await automatic.stop();
    await f.close();
  }
});

test("a model failure after saving a repair retains that revision in the chain and Report tab", async () => {
  const f = fixture((n) => {
    if (n === 1) return saveReply(bundle);
    throw new Error("Model disconnected after saving");
  });
  try {
    await setPermissions(f.lib, "auto");
    const initial = await f.save(wrong);
    await f.automatic.waitForIdle();
    const c = f.lib.candidate(initial.id);
    const run = automaticRuns(f.lib.root)[0]!;
    assert.notEqual(c.revision, initial.revision);
    assert.equal(run.revision, c.revision);
    assert.equal(run.state, "failed");
    assert.equal(run.attempts.length, 1);
    assert.equal(f.lib.current("sum"), null);
    assert.match(
      detailTabs(f.lib, c).find((t) => t.title === "Report")!.text,
      /Model disconnected/,
    );
  } finally {
    await f.close();
  }
});
