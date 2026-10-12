import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const installed = process.argv[2];
const root = homedir();
const records = (name) =>
  readdirSync(join(root, ".atac", name))
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(readFileSync(join(root, ".atac", name, n), "utf8")));
writeFileSync(join(root, "sample.txt"), "a\nb");
for (const kind of ["direct", "codemode", "batch"]) {
  let parentResponses = 0,
    analysisResponses = 0;
  let releaseAnalysis;
  const analysisReady = new Promise((resolve) => {
    releaseAnalysis = resolve;
  });
  const candidate = {
    manifest: {
      program_id: `line-count-${kind}`,
      purpose: "Count lines in a file",
      when_to_use: "Repeated line counts",
      tags: ["files"],
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      output_schema: { type: "integer" },
      tools: ["read"],
      test_tools: [],
      side_effects: "Read files",
    },
    main: 'return (await tools.read({path: inputs.path})).split("\\n").length;',
    tests: 'await check.equal(await run({path: "sample.txt"}), 2);',
  };
  const modelRuntime = await ModelRuntime.create();
  modelRuntime.registerProvider("atac-e2e", {
    baseUrl: "http://unused.invalid",
    apiKey: "fixture",
    api: "openai-completions",
    models: [
      {
        id: "fixture",
        name: "Fixture",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 4096,
      },
    ],
    streamSimple: (_model, context) => {
      const tools = context.messages
        .filter((message) => message.role === "system")
        .flatMap((message) => message.toolsAdded ?? []);
      const analysis =
        tools.length === 3 && tools.every((t) => t.name.startsWith("atac_"));
      let content;
      if (analysis) {
        analysisResponses++;
        const prompt = context.messages.find((m) => m.role === "user");
        const { snapshot, existing_programs } = JSON.parse(
          prompt.content.map((c) => c.text ?? "").join(""),
        );
        assert.deepEqual(existing_programs.published, []);
        if (kind === "direct") assert.deepEqual(existing_programs.inbox, []);
        else if (kind === "codemode") {
          assert.equal(existing_programs.inbox.length, 1);
          assert.equal(
            existing_programs.inbox[0].program_id,
            "line-count-direct",
          );
          assert.equal(existing_programs.inbox[0].status, "untested");
        }
        const tasks =
          kind === "batch"
            ? snapshot.tasks.map((t) => ({ ...t, ...JSON.parse(t.text) }))
            : [snapshot];
        if (kind === "batch") {
          assert.equal(tasks.length, 2);
          assert.deepEqual(
            tasks.map((t) => t.source.goal),
            ["Count lines with batch", "Count another file"],
          );
        }
        const first = tasks[0];
        assert.equal(first.source.goal, `Count lines with ${kind}`);
        assert.ok(
          first.calls.some(
            (call) => call.name === "read" && call.type === "tool_result",
          ),
        );
        if (kind === "codemode")
          assert.ok(
            first.calls.some((call) => call.name === "read" && call.parent),
          );
        assert.ok(
          first.messages.some((message) => message.text.includes("Two lines")),
        );
        content =
          analysisResponses === 1
            ? [
                {
                  type: "toolCall",
                  id: "search",
                  name: "atac_search",
                  arguments: { query: candidate.manifest.program_id },
                },
              ]
            : analysisResponses === 2
              ? [
                  {
                    type: "toolCall",
                    id: "save",
                    name: "atac_save",
                    arguments: candidate,
                  },
                ]
              : kind === "batch" && analysisResponses === 3
                ? [
                    {
                      type: "toolCall",
                      id: "save-second",
                      name: "atac_save",
                      arguments: {
                        ...candidate,
                        manifest: {
                          ...candidate.manifest,
                          program_id: "batch-second",
                        },
                      },
                    },
                  ]
                : [{ type: "text", text: "Candidate saved" }];
      } else {
        parentResponses++;
        const catalog = context.messages
          .filter((m) => m.role === "system")
          .map((m) => m.sections?.atac_programs)
          .filter(Boolean)
          .at(-1);
        assert.match(
          catalog,
          /Prefer reusing a matching published ATaC program/,
        );
        assert.doesNotMatch(catalog, /"program_id":"line-count-/);
        content =
          parentResponses % 2 === 1
            ? [
                {
                  type: "toolCall",
                  id: `source-${kind}`,
                  name: kind === "direct" ? "read" : "codemode",
                  arguments:
                    kind === "direct"
                      ? { path: "sample.txt" }
                      : {
                          code: 'text(await tools.read({path: "sample.txt"}));',
                        },
                },
              ]
            : [{ type: "text", text: "Two lines" }];
      }
      const message = {
        role: "assistant",
        api: "openai-completions",
        provider: "atac-e2e",
        model: "fixture",
        timestamp: Date.now(),
        content,
        stopReason: content[0].type === "toolCall" ? "toolUse" : "stop",
        usage: {
          input: 10,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 20,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const stream = createAssistantMessageEventStream();
      void (analysis ? analysisReady : Promise.resolve()).then(() => {
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
      });
      return stream;
    },
  });
  const settingsManager = SettingsManager.inMemory({
    packages: [],
    cacheWarming: "off",
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: getAgentDir(),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: [join(installed, "src/extension.ts")],
    extensionFactories: [createCodemodeExtension({ mode: "on" })],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const { session } = await createAgentSession({
    cwd: root,
    agentDir: getAgentDir(),
    settingsManager,
    resourceLoader: loader,
    modelRuntime,
    model: modelRuntime.getModel("atac-e2e", "fixture"),
    sessionManager: SessionManager.inMemory(root),
  });
  const notices = [];
  const widgets = [];
  try {
    await session.bindExtensions({
      mode: "rpc",
      uiContext: {
        setWidget(key, lines, options) {
          assert.equal(key, "atac");
          assert.equal(options.placement, "aboveEditor");
          widgets.push(lines);
        },
        notify(message, type) {
          notices.push({ message, type });
        },
        select() {
          throw new Error("Background dialog");
        },
        input() {
          throw new Error("Background question");
        },
      },
    });
    if (kind !== "direct")
      session.setActiveToolsByName([
        ...session.getActiveToolNames(),
        "codemode",
      ]);
    if (kind === "batch") {
      await session.prompt("/atac:permissions on-demand");
      notices.length = 0;
    }
    // The request must settle while the analysis model is still held at its gate.
    await session.prompt(`Count lines with ${kind}`);
    assert.equal(
      records("inbox").some(
        (c) => c.program_id === candidate.manifest.program_id,
      ),
      false,
    );
    if (kind === "batch") {
      await session.prompt("Count another file");
      assert.equal(analysisResponses, 0, "on-demand must not invoke analysis");
      assert.equal(
        records("jobs").filter(
          (j) => j.snapshot.source.session_id === session.sessionId,
        ).length,
        0,
      );
      await session.reload();
      await session.prompt("/atac:extract");
      await session.prompt("/atac:extract");
      assert.equal(
        records("jobs").filter(
          (j) => j.snapshot.source.session_id === session.sessionId,
        ).length,
        1,
      );
      assert.ok(
        notices.some(
          (n) => n.message === "ATaC: No new completed work to extract.",
        ),
      );
      notices.length = 0;
    }
    releaseAnalysis();
    const deadline = Date.now() + 10_000;
    let job;
    do {
      job = records("jobs").find(
        (j) => j.snapshot.source.session_id === session.sessionId,
      );
      if (
        job &&
        ["done", "failed"].includes(job.state) &&
        notices.length === (kind === "batch" ? 2 : 1)
      )
        break;
      await delay(25);
    } while (Date.now() < deadline);
    assert.equal(job?.state, "done", job?.diagnostic);
    assert.deepEqual(notices, [
      {
        message: `ATaC: Saved ${candidate.manifest.program_id} to Inbox.`,
        type: "info",
      },
      ...(kind === "batch"
        ? [{ message: "ATaC: Saved batch-second to Inbox.", type: "info" }]
        : []),
    ]);
    assert.equal(widgets[0]?.[0], "ATaC  Extracting programs");
    assert.equal(widgets.at(-1), undefined);
    assert.equal(parentResponses, kind === "batch" ? 4 : 2);
    assert.equal(analysisResponses, kind === "batch" ? 4 : 3);
    assert.equal(job.usage.responses, kind === "batch" ? 4 : 3);
    const saved = records("inbox").find((c) => c.id === job.saved_id);
    assert.equal(saved.status, "untested");
    assert.equal(records("reports").length, 0);
    if (kind === "batch") {
      assert.equal(job.saved_ids.length, 2);
      await session.bindExtensions({});
      await session.prompt("/atac:extract");
      assert.equal(analysisResponses, 4);
    }
    assert.equal(
      session.messages.some((m) =>
        JSON.stringify(m).includes("Candidate saved"),
      ),
      false,
    );
  } finally {
    releaseAnalysis();
    await session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "quit",
    });
    session.dispose();
  }
}
assert.equal(records("jobs").length, 3);
console.log(
  "Harvest lifecycle passed: ordinary and nested tool calls, independent analysis, activity widget and completion notices, separate usage, on-demand batch extraction after reload.",
);
