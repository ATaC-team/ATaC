import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { stream as responses } from "@earendil-works/pi-ai/api/openai-responses";
import { stream as completions } from "@earendil-works/pi-ai/api/openai-completions";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Uses the published Sum fixture in package-session's isolated HOME.
const installed = process.argv[2];
const legacy = join(homedir(), "legacy-prompt.ts");
writeFileSync(
  legacy,
  `export default function(pi) {
  pi.on("before_agent_start", event => ({systemPrompt: event.systemPrompt + "\\n\\nLegacy extension policy."}));
}`,
);
for (const order of ["none", "before", "after"]) {
  const contexts = [];
  const runtime = await ModelRuntime.create();
  runtime.registerProvider("prompt-fixture", {
    baseUrl: "http://unused.invalid",
    apiKey: "fixture",
    api: "openai-responses",
    models: [
      {
        id: "fixture",
        name: "Fixture",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 2000,
      },
    ],
    streamSimple: (_model, context) => {
      const main = context.messages.some(
        (m) =>
          m.role === "system" &&
          m.toolsAdded?.some((t) => t.name === "atac_run"),
      );
      if (main) contexts.push(structuredClone(context));
      const message = {
        role: "assistant",
        api: "openai-responses",
        provider: "prompt-fixture",
        model: "fixture",
        timestamp: Date.now(),
        stopReason: "stop",
        content: [{ type: "text", text: "No action needed" }],
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: "done", reason: "stop", message });
        stream.end();
      });
      return stream;
    },
  });
  const entry = join(installed, "src/extension.ts");
  const settingsManager = SettingsManager.inMemory({
    packages: [],
    cacheWarming: "off",
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd: homedir(),
    agentDir: getAgentDir(),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noContextFiles: true,
    noThemes: true,
    noPromptTemplates: true,
    additionalExtensionPaths:
      order === "none"
        ? [entry]
        : order === "before"
          ? [legacy, entry]
          : [entry, legacy],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const model = runtime.getModel("prompt-fixture", "fixture");
  const { session } = await createAgentSession({
    cwd: homedir(),
    agentDir: getAgentDir(),
    settingsManager,
    resourceLoader: loader,
    modelRuntime: runtime,
    model,
    sessionManager: SessionManager.inMemory(homedir()),
  });
  try {
    await session.bindExtensions({});
    await session.prompt(
      "Which published programs are available? Do not call tools.",
    );
    await session.prompt(
      "Check the available programs again. Do not call tools.",
    );
    assert.equal(contexts.length, 2);
    for (const context of contexts) {
      for (const [api, stream] of [
        ["openai-responses", responses],
        ["openai-completions", completions],
      ]) {
        let payload;
        const result = await stream({ ...model, api }, context, {
          apiKey: "fixture",
          maxRetries: 0,
          onPayload(value) {
            payload = value;
            throw new Error("Captured before network");
          },
          fetch() {
            throw new Error("Unexpected network request");
          },
        }).result();
        assert.match(result.errorMessage, /Captured before network/);
        const instructions = (payload.input ?? payload.messages)
          .filter((m) => ["system", "developer"].includes(m.role))
          .map((m) => m.content)
          .join("\n");
        assert.match(
          instructions,
          /"program_id":"sum","title":"Sum"/,
          `${order}: ${api}`,
        );
        assert.match(
          instructions,
          /Prefer reusing a matching published ATaC program/,
        );
        assert.equal(
          instructions.split("<atac_programs>").length - 1,
          1,
          `${order}: duplicate catalog`,
        );
        assert.doesNotMatch(instructions, /"program_id":"cancel-/);
        if (order !== "none")
          assert.match(instructions, /Legacy extension policy/);
      }
    }
  } finally {
    await session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "quit",
    });
    session.dispose();
  }
}
console.log(
  "Prompt delivery passed: provider payloads, full-prompt overrides in either load order, repeated requests.",
);
