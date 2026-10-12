import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Library, atomicJson, readJson } from "../src/library/storage.js";
import {
  authorizeAutomatic,
  loadConfig,
  setPermissions,
} from "../src/config.js";
import { registerPermissions } from "../src/pi/permissions.js";
import { programPrompt } from "../src/pi/prompt.js";

test("permissions preserve existing config, persist across sessions, and rotate authorization only on changes", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-config-"));
  try {
    const library = new Library(root);
    assert.equal(loadConfig(root).permissions, "manual");
    const fields = {
      timeoutMs: 500,
      memoryLimitBytes: 8388608,
      model: { provider: "fixture", id: "model" },
      unrelated: { value: true },
    };
    atomicJson(join(root, "config.json"), fields);
    assert.equal(loadConfig(root).permissions, "manual");
    const auto = await setPermissions(library, "auto");
    assert.equal(new Library(root).root, library.root);
    assert.equal(loadConfig(root).permissions, "auto");
    assert.equal(
      (await setPermissions(library, "auto")).permissionVersion,
      auto.permissionVersion,
    );
    authorizeAutomatic(root, auto.permissionVersion!);
    const manual = await setPermissions(new Library(root), "manual");
    assert.notEqual(manual.permissionVersion, auto.permissionVersion);
    assert.throws(() => authorizeAutomatic(root, auto.permissionVersion!));
    await setPermissions(library, "auto");
    assert.throws(() => authorizeAutomatic(root, auto.permissionVersion!));
    const { permissions, permissionVersion, ...rest } = readJson<
      Record<string, unknown>
    >(join(root, "config.json"))!;
    assert.deepEqual(rest, fields);
    assert.equal(permissions, "auto");
    assert.equal(typeof permissionVersion, "string");
    assert.match(programPrompt(library), /Publishing mode: auto/);
    await setPermissions(library, "manual");
    assert.match(programPrompt(library), /Publishing mode: manual/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("permissions command supports selection, cancellation, invalid arguments, and noninteractive sessions", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-command-"));
  try {
    const library = new Library(root);
    let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    const notices: string[] = [];
    const messages: string[] = [];
    let changed = 0;
    let selection: string | undefined;
    const pi = {
      registerCommand(name: string, command: { handler: typeof handler }) {
        assert.equal(name, "atac:permissions");
        handler = command.handler;
      },
      sendMessage(message: { content: string; display: boolean }) {
        assert.equal(message.display, true);
        messages.push(message.content);
      },
    } as unknown as ExtensionAPI;
    registerPermissions(pi, library, () => {
      changed++;
    });
    const ctx = {
      hasUI: true,
      ui: {
        notify: (text: string) => {
          notices.push(text);
        },
        select: async (title: string, choices: string[]) => {
          assert.match(title, /Manual review|Automatic/);
          assert.deepEqual(choices, ["Manual review", "Automatic"]);
          return selection;
        },
      },
    } as unknown as ExtensionCommandContext;
    await handler("invalid", ctx);
    assert.match(notices.pop()!, /Usage:/);
    assert.equal(changed, 0);
    await handler("", ctx);
    assert.equal(changed, 0, "cancel does not change mode");
    selection = "Automatic";
    await handler("", ctx);
    assert.equal(loadConfig(root).permissions, "auto");
    await handler("manual", ctx);
    assert.equal(loadConfig(root).permissions, "manual");
    ctx.hasUI = false;
    await handler("", ctx);
    assert.match(messages.pop()!, /permissions: manual\nUsage:/);
    await handler("auto", ctx);
    assert.equal(loadConfig(root).permissions, "auto");
    assert.match(messages.pop()!, /Automatic publishing enabled/);
    await handler("auto extra", ctx);
    assert.match(messages.pop()!, /Usage:/);
    assert.equal(changed, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
