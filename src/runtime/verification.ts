import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionContext,
  type ExtensionFactory,
  type ToolDefinition,
  type McpExtensionOptions,
} from "@earendil-works/pi-coding-agent";
import { type Candidate, type Report, errorText } from "../library/program.js";
import { Library } from "../library/storage.js";
import { testProgram, type Limits } from "./runner.js";
import { roles } from "./roles.js";

export async function closeSession(session: AgentSession): Promise<void> {
  try {
    await session.abort();
    await session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "quit",
    });
  } finally {
    session.dispose();
  }
}

/** Created only inside the command handler after the user selected the displayed revision. */
export async function verifyCandidate(
  library: Library,
  displayed: Candidate,
  parent: ExtensionContext,
  signal: AbortSignal,
  limits: Limits,
  options: {
    agentDir?: string;
    factories?: ExtensionFactory[];
    mcp?: McpExtensionOptions;
  } = {},
): Promise<Candidate> {
  const claim = await library.claim(displayed.id, displayed.revision);
  let report: Report | undefined;
  try {
    await roles.run("verification", async () => {
      const bundle = library.bundle(claim.revision);
      const agentDir = options.agentDir ?? getAgentDir();
      const settingsManager = SettingsManager.create(
        claim.source.cwd,
        agentDir,
        {
          projectTrusted:
            parent.isProjectTrusted() && parent.cwd === claim.source.cwd,
        },
      );
      settingsManager.applyOverrides({
        cacheWarming: "off",
        retry: { enabled: false },
        compaction: { enabled: false },
      });
      const resourceLoader = new DefaultResourceLoader({
        cwd: claim.source.cwd,
        agentDir,
        settingsManager,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        extensionFactories: [
          createCodemodeExtension({ mode: "on" }),
          createToolSearchExtension(),
          createMcpExtension(options.mcp),
          ...(options.factories ?? []),
        ],
      });
      await resourceLoader.reload();
      signal.throwIfAborted();
      const errors = resourceLoader.getExtensions().errors;
      if (errors.length)
        throw new Error(
          `Cannot rebuild verification extensions: ${errors.map((e) => `${e.path}: ${e.error}`).join("; ")}`,
        );
      const internalName = "atac_internal_verify";
      const testTool: ToolDefinition = {
        name: internalName,
        label: "Test program",
        description: "Run program tests",
        exposure: "model-only",
        parameters: Type.Object({}),
        async execute(_id, _params, _signal, _update, ctx) {
          signal.throwIfAborted();
          report = await testProgram(bundle, ctx, signal, limits);
          return { content: [], details: {} };
        },
      };
      const { session } = await createAgentSession({
        cwd: claim.source.cwd,
        agentDir,
        settingsManager,
        resourceLoader,
        sessionManager: SessionManager.inMemory(claim.source.cwd),
        customTools: [testTool],
        model: parent.model,
      });
      try {
        signal.throwIfAborted();
        // Permission extensions retain the originating user's UI. ATaC adds no extra prompt.
        await session.bindExtensions({
          uiContext: parent.ui,
          mode: parent.mode,
        });
        // Execute the public session-wrapped tool: it supplies a live ExtensionToolContext.
        // No provider prompt is made; all business calls go through ctx.executeTool.
        const wrapped = session.agent.state.tools.find(
          (t) => t.name === internalName,
        );
        if (!wrapped)
          throw new Error("Internal verification tool is unavailable");
        const callId = randomUUID();
        // pi's nested-call pipeline requires a parent assistant envelope. This
        // host-authored, zero-usage entry exists only in the validation session;
        // it is never sent to a provider or appended to the user's conversation.
        session.sessionManager.appendMessage({
          role: "assistant",
          api: "openai-completions",
          provider: "atac-host",
          model: "inbox-verification",
          timestamp: Date.now(),
          stopReason: "toolUse",
          content: [
            { type: "toolCall", id: callId, name: internalName, arguments: {} },
          ],
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
        });
        session.refreshContext();
        await wrapped.execute(callId, {}, signal);
      } finally {
        await closeSession(session);
      }
    });
  } catch (error) {
    report = {
      id: randomUUID(),
      revision: claim.revision,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      ok: false,
      interrupted: signal.aborted,
      diagnostic: errorText(error),
      runs: 0,
      assertions: 0,
      calls: [],
    };
  }
  if (!report) throw new Error("Verification produced no report");
  if (signal.aborted) {
    report.ok = false;
    report.interrupted = true;
    report.diagnostic =
      "Verification interrupted; external effects are not rolled back";
  }
  return library.finish(claim, report, signal);
}
