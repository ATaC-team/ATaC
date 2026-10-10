import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Type } from "typebox";
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
  type ExtensionFactory,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { Library } from "../src/library/storage.js";
import { type Bundle } from "../src/library/program.js";
import { verifyCandidate, closeSession } from "../src/runtime/verification.js";
import { programTools } from "../src/pi/tools.js";
import { DEFAULT_LIMITS } from "../src/runtime/runner.js";
import { openInbox } from "../src/pi/inbox.js";
import { Jobs } from "../src/harvest/jobs.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "atac-pi-"));
  const agentDir = join(dir, "agent");
  mkdirSync(agentDir);
  const library = new Library(join(dir, "library"));
  writeFileSync(join(dir, "sample.txt"), "a\nb");
  const parent = {
    cwd: dir,
    hasUI: true,
    mode: "rpc",
    isProjectTrusted: () => false,
    ui: { notify() {} },
  } as unknown as ExtensionContext;
  const source = {
    cwd: dir,
    session_id: "s",
    request_id: "r",
    goal: "read sample",
  };
  const bundle: Bundle = {
    manifest: {
      program_id: "read-file",
      name: "读取文件",
      purpose: "Read",
      when_to_use: "files",
      tags: [],
      input_schema: { type: "object" },
      output_schema: { type: "string" },
      tools: ["read"],
      test_tools: [],
      side_effects: "reads only",
    },
    main: "return await tools.read({path: inputs.path});",
    tests: 'await check.equal(await run({path: "sample.txt"}), "a\\nb");',
  };
  return { dir, agentDir, library, parent, source, bundle };
}

test("real pi SDK verification calls built-in tools through hooks with no model request", async () => {
  const f = fixture();
  const calls: string[] = [];
  const hook: ExtensionFactory = (pi) => {
    pi.on("tool_call", (e) => {
      calls.push(e.toolName);
    });
  };
  try {
    const c = await f.library.save(f.bundle, f.source);
    const done = await verifyCandidate(
      f.library,
      c,
      f.parent,
      new AbortController().signal,
      DEFAULT_LIMITS,
      {
        mcp: { loadConfig: () => ({ servers: [], errors: [] }) },
        agentDir: f.agentDir,
        factories: [hook],
      },
    );
    assert.equal(done.status, "published", done.diagnostic);
    assert.deepEqual(calls, ["read"]);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("permission extension can block a test; missing ephemeral tools fail without publishing", async () => {
  const f = fixture();
  const hook: ExtensionFactory = (pi) => {
    pi.on("tool_call", (e) =>
      e.toolName === "read"
        ? { block: true, reason: "fixture policy" }
        : undefined,
    );
  };
  try {
    const c = await f.library.save(f.bundle, f.source);
    const done = await verifyCandidate(
      f.library,
      c,
      f.parent,
      new AbortController().signal,
      DEFAULT_LIMITS,
      {
        mcp: { loadConfig: () => ({ servers: [], errors: [] }) },
        agentDir: f.agentDir,
        factories: [hook],
      },
    );
    assert.equal(done.status, "failed");
    assert.match(done.diagnostic!, /fixture policy/);
    const absent = await f.library.save(
      {
        ...f.bundle,
        manifest: { ...f.bundle.manifest, tools: ["temporary_tool"] },
      },
      f.source,
    );
    const missing = await verifyCandidate(
      f.library,
      absent,
      f.parent,
      new AbortController().signal,
      DEFAULT_LIMITS,
      {
        mcp: { loadConfig: () => ({ servers: [], errors: [] }) },
        agentDir: f.agentDir,
      },
    );
    assert.equal(missing.status, "failed");
    assert.match(
      missing.diagnostic!,
      /Required callable tool is unavailable: temporary_tool/,
    );
    assert.equal(f.library.current("read-file"), null);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("real pi SDK loads an extension tool and converts its structured result", async () => {
  const f = fixture();
  const tool: ExtensionFactory = (pi) => {
    pi.registerTool({
      name: "double",
      label: "Double",
      description: "double",
      exposure: "codemode",
      parameters: Type.Object({ n: Type.Number() }),
      outputSchema: Type.Object({ n: Type.Number() }),
      async execute(_id, p) {
        return { content: [], structuredContent: { n: p.n * 2 }, details: {} };
      },
    });
  };
  try {
    const c = await f.library.save(
      {
        ...f.bundle,
        manifest: {
          ...f.bundle.manifest,
          tools: ["double"],
          output_schema: { type: "number" },
        },
        main: "return (await tools.double({n: inputs.n})).n;",
        tests: "await check.equal(await run({n: 3}), 6);",
      },
      f.source,
    );
    const done = await verifyCandidate(
      f.library,
      c,
      f.parent,
      new AbortController().signal,
      DEFAULT_LIMITS,
      {
        mcp: { loadConfig: () => ({ servers: [], errors: [] }) },
        agentDir: f.agentDir,
        factories: [tool],
      },
    );
    assert.equal(done.status, "published", done.diagnostic);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("Inbox open/close/archive and non-UI mode cannot execute tests or models", async () => {
  const f = fixture();
  const selections: string[] = [];
  const ui = {
    select: async (_title: string, options: string[]) => {
      selections.push(options.join("|"));
      return options.includes("Archive")
        ? "Archive"
        : (options.find((o) => o.startsWith("1.")) ?? "Close");
    },
  } as unknown as ExtensionUIContext;
  try {
    const c = await f.library.save(f.bundle, f.source);
    const jobs = new Jobs(f.library, DEFAULT_LIMITS);
    await openInbox(
      f.library,
      jobs,
      DEFAULT_LIMITS,
      { ...f.parent, ui },
      new AbortController().signal,
    );
    assert.equal(f.library.candidate(c.id).status, "archived");
    assert.equal(f.library.current(c.program_id), null);
    assert.deepEqual(jobs.list(), []);
    const before = selections.length;
    await openInbox(
      f.library,
      jobs,
      DEFAULT_LIMITS,
      { ...f.parent, hasUI: false, ui },
      new AbortController().signal,
    );
    assert.equal(selections.length, before);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("real MCP stdio server connects, returns its envelope and passes through permission hooks", async () => {
  const f = fixture();
  let observed = 0;
  const hook: ExtensionFactory = (pi) => {
    pi.on("tool_call", (e) => {
      if (e.toolName === "mcp__fixture__double") observed++;
    });
  };
  try {
    const c = await f.library.save(
      {
        ...f.bundle,
        manifest: {
          ...f.bundle.manifest,
          tools: ["mcp__fixture__double"],
          output_schema: { type: "number" },
        },
        main: "return (await tools.mcp__fixture__double({n: inputs.n})).structuredContent.n;",
        tests: "await check.equal(await run({n: 4}), 8);",
      },
      f.source,
    );
    const done = await verifyCandidate(
      f.library,
      c,
      f.parent,
      new AbortController().signal,
      DEFAULT_LIMITS,
      {
        agentDir: f.agentDir,
        factories: [hook],
        mcp: {
          logPath: join(f.dir, "mcp.log"),
          loadConfig: () => ({
            errors: [],
            servers: [
              {
                name: "fixture",
                source: "test",
                config: {
                  command: process.execPath,
                  args: [
                    fileURLToPath(
                      new URL("./fixtures/mcp-server.mjs", import.meta.url),
                    ),
                  ],
                },
              },
            ],
          }),
        },
      },
    );
    assert.equal(done.status, "published", done.diagnostic);
    assert.equal(observed, 1);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("fresh-session atac_run waits for MCP registration and preserves hooks and output", async () => {
  const f = fixture();
  const calls: string[] = [];
  const mcp = {
    logPath: join(f.dir, "mcp.log"),
    loadConfig: () => ({
      errors: [],
      servers: [
        {
          name: "fixture",
          source: "test",
          config: {
            command: process.execPath,
            args: [
              fileURLToPath(
                new URL("./fixtures/mcp-server.mjs", import.meta.url),
              ),
              "200",
            ],
            exposure: "codemode" as const,
          },
        },
      ],
    }),
  };
  let session:
    | Awaited<ReturnType<typeof createAgentSession>>["session"]
    | undefined;
  try {
    const c = await f.library.save(
      {
        ...f.bundle,
        manifest: {
          ...f.bundle.manifest,
          tools: ["mcp__fixture__double"],
          output_schema: { type: "number" },
        },
        main: "return (await tools.mcp__fixture__double({n: inputs.n})).structuredContent.n;",
        tests: "await check.equal(await run({n: 4}), 8);",
      },
      f.source,
    );
    const published = await verifyCandidate(
      f.library,
      c,
      f.parent,
      new AbortController().signal,
      DEFAULT_LIMITS,
      { agentDir: f.agentDir, mcp },
    );
    assert.equal(published.status, "published", published.diagnostic);
    const settingsManager = SettingsManager.inMemory({
      packages: [],
      cacheWarming: "off",
    });
    const loader = new DefaultResourceLoader({
      cwd: f.dir,
      agentDir: f.agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        createCodemodeExtension({ mode: "on" }),
        createMcpExtension(mcp),
        (pi) => {
          for (const tool of programTools(f.library, DEFAULT_LIMITS))
            pi.registerTool(tool);
          pi.on("tool_call", (e) => {
            calls.push(e.toolName);
          });
        },
      ],
    });
    await loader.reload();
    ({ session } = await createAgentSession({
      cwd: f.dir,
      agentDir: f.agentDir,
      settingsManager,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(f.dir),
    }));
    await session.bindExtensions({});
    assert.ok(
      !session.getCallableToolNames().includes("mcp__fixture__double"),
      "fixture must still be connecting",
    );
    session.sessionManager.appendMessage({
      role: "assistant",
      api: "openai-completions",
      provider: "fixture",
      model: "fixture",
      timestamp: Date.now(),
      stopReason: "toolUse",
      content: [
        {
          type: "toolCall",
          id: "reuse",
          name: "atac_run",
          arguments: { program_id: c.program_id, inputs: { n: 11 } },
        },
      ],
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    session.refreshContext();
    const tool = session.agent.state.tools.find((t) => t.name === "atac_run")!;
    const result = await tool.execute("reuse", {
      program_id: c.program_id,
      inputs: { n: 11 },
    });
    assert.deepEqual(result.content, [{ type: "text", text: "22" }]);
    assert.deepEqual(calls, ["mcp__fixture__double"]);
  } finally {
    if (session) await closeSession(session);
    rmSync(f.dir, { recursive: true, force: true });
  }
});
