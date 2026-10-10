import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const installed = process.argv[2];
const managed = process.argv[3] === "managed";
const dataDir = join(homedir(), ".atac");
const asset = {
  manifest: {
    program_id: "sum",
    purpose: "Add values",
    when_to_use: "summing",
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
const child = async () => {
  const settingsManager = managed
    ? SettingsManager.create(homedir(), getAgentDir())
    : SettingsManager.inMemory({
        packages: [],
        extensions: [],
        cacheWarming: "off",
      });
  const loader = new DefaultResourceLoader({
    cwd: homedir(),
    agentDir: getAgentDir(),
    settingsManager,
    noExtensions: !managed,
    noSkills: true,
    noContextFiles: true,
    noThemes: true,
    noPromptTemplates: true,
    additionalExtensionPaths: managed
      ? []
      : [join(installed, "src/extension.ts")],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const { session } = await createAgentSession({
    cwd: homedir(),
    agentDir: getAgentDir(),
    settingsManager,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(homedir()),
  });
  return session;
};
const cleanup = async (session) => {
  await session.extensionRunner.emit({
    type: "session_shutdown",
    reason: "quit",
  });
  session.dispose();
};
let session = await child();
let trialSelected = false;
let dialogs = 0;
try {
  await session.bindExtensions({
    mode: "rpc",
    uiContext: {
      select: async (_title, options) => {
        assert.ok(++dialogs < 20, `Inbox did not converge: ${_title}`);
        if (options.includes("Test and publish")) {
          trialSelected = true;
          return "Test and publish";
        }
        return (
          options.find((o) => o.startsWith("1.")) ??
          (options.includes("Back") ? "Back" : "Close")
        );
      },
      notify() {
        throw new Error("Unexpected proactive notification");
      },
    },
  });
  const names = session
    .getAllTools()
    .filter((t) => t.name.startsWith("atac_"))
    .map((t) => t.name)
    .sort();
  assert.deepEqual(names, ["atac_get", "atac_run", "atac_save", "atac_search"]);
  const save = session.agent.state.tools.find((t) => t.name === "atac_save");
  await save.execute("save", asset);
  assert.equal(readdirSync(join(dataDir, "inbox")).length, 1);
  const promptOptions = {
    cwd: homedir(),
    sections: { other_extension: "Keep this section" },
  };
  const before = await session.extensionRunner.emitBeforeAgentStart(
    "Add numbers",
    undefined,
    promptOptions,
  );
  assert.doesNotMatch(
    before.systemPromptOptions.sections.atac_programs,
    /"program_id":"sum"/,
  );
  assert.equal(
    before.systemPromptOptions.sections.other_extension,
    "Keep this section",
  );
  await session.prompt("/atac:inbox");
  const after = await session.extensionRunner.emitBeforeAgentStart(
    "Add numbers again",
    undefined,
    before.systemPromptOptions,
  );
  assert.match(
    after.systemPromptOptions.sections.atac_programs,
    /"program_id":"sum","purpose":"Add values"/,
  );
  assert.equal(
    Object.keys(after.systemPromptOptions.sections).filter(
      (key) => key === "atac_programs",
    ).length,
    1,
  );
  const forced = await session.extensionRunner.emitBeforeAgentStart(
    "Legacy prompt",
    undefined,
    {
      ...promptOptions,
      forceSystemPrompt:
        "Legacy policy.\n<atac_programs>stale catalog</atac_programs>",
    },
  );
  assert.match(forced.systemPromptOptions.forceSystemPrompt, /Legacy policy/);
  assert.match(
    forced.systemPromptOptions.forceSystemPrompt,
    /"program_id":"sum","purpose":"Add values"/,
  );
  assert.doesNotMatch(
    forced.systemPromptOptions.forceSystemPrompt,
    /stale catalog/,
  );
  assert.equal(trialSelected, true);
  assert.ok(
    JSON.parse(readFileSync(join(dataDir, "programs/sum/current.json"), "utf8"))
      .revision,
  );
} finally {
  await cleanup(session);
}

for (const interruption of ["input", "shutdown"]) {
  session = await child();
  const marker = join(homedir(), `started-${interruption}`);
  try {
    await session.bindExtensions({
      mode: "rpc",
      uiContext: {
        select: async (_title, options) =>
          options.includes("Test and publish")
            ? "Test and publish"
            : options.find((option) => option.startsWith("1.")),
        notify() {
          throw new Error("Unexpected notification");
        },
      },
    });
    const save = session.agent.state.tools.find(
      (tool) => tool.name === "atac_save",
    );
    const saved = await save.execute("save", {
      ...asset,
      manifest: {
        ...asset.manifest,
        program_id: `cancel-${interruption}`,
        test_tools: ["write"],
        side_effects: "Write a local test fixture",
      },
      tests: `await tools.write({path: ${JSON.stringify(marker)}, content: "started"}); while (true) {}`,
    });
    const { candidate_id } = JSON.parse(saved.content[0].text);
    const running = session.prompt("/atac:inbox");
    const deadline = Date.now() + 10_000;
    while (!existsSync(marker) && Date.now() < deadline) await delay(25);
    assert.ok(
      existsSync(marker),
      "verification must start before interruption",
    );
    if (interruption === "input")
      await session.extensionRunner.emitInput(
        "Next task",
        undefined,
        "interactive",
      );
    else
      await session.extensionRunner.emit({
        type: "session_shutdown",
        reason: "new",
      });
    await running;
    const record = JSON.parse(
      readFileSync(join(dataDir, "inbox", `${candidate_id}.json`), "utf8"),
    );
    assert.equal(record.status, "interrupted");
    assert.equal(
      existsSync(
        join(dataDir, "programs", `cancel-${interruption}`, "current.json"),
      ),
      false,
    );
    // Archive the first fixture so the next scenario selects its own candidate.
    await session.bindExtensions({
      mode: "rpc",
      uiContext: {
        select: async (_title, options) =>
          options.includes("Archive")
            ? "Archive"
            : options.find((option) => option.startsWith("1.")),
      },
    });
    if (interruption === "input") await session.prompt("/atac:inbox");
  } finally {
    await cleanup(session);
  }
}
session = await child();
try {
  await session.bindExtensions({});
  const search = session.agent.state.tools.find(
    (t) => t.name === "atac_search",
  );
  assert.match(
    (await search.execute("search", { query: "sum" })).content[0].text,
    /program_id/,
  );
  const run = session.agent.state.tools.find((t) => t.name === "atac_run");
  const output = await run.execute("run", {
    program_id: "sum",
    inputs: [10, 20],
  });
  assert.equal(output.content.at(-1).text, "30");
} finally {
  await cleanup(session);
}
