import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SessionManager,
  type ExtensionContext,
  type ToolCallEvent,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { Recorder } from "../src/harvest/snapshot.js";

function context() {
  const sessionManager = SessionManager.inMemory("/tmp");
  return { sessionManager, cwd: "/tmp" } as unknown as ExtensionContext;
}

test("snapshot preserves the original request, follow-ups, ordinary and nested tool calls", () => {
  for (const nested of [false, true]) {
    const ctx = context();
    const manager = ctx.sessionManager as SessionManager;
    manager.appendMessage({
      role: "user",
      content: "Previous task",
      timestamp: 0,
    });
    const recorder = new Recorder();
    recorder.begin(ctx);
    const requestId = manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "Count lines in files" }],
      timestamp: 1,
    });
    const call = {
      type: "tool_call",
      toolName: "read",
      toolCallId: "read-1",
      input: { path: "sample.txt" },
      ...(nested ? { parentToolCallId: "codemode-1" } : {}),
    } as ToolCallEvent;
    recorder.record(call);
    recorder.record({
      ...call,
      type: "tool_result",
      details: {},
      content: [{ type: "text", text: "a\nb" }],
      isError: false,
    });
    recorder.begin(ctx);
    manager.appendMessage({
      role: "user",
      content: "Also include empty files",
      timestamp: 2,
    });
    const snapshot = recorder.snapshot(ctx, [
      { name: "read", description: "Read files", parameters: {} },
      { name: "unrelated", description: "Unused", parameters: {} },
    ] as ToolInfo[])!;
    assert.equal(snapshot.source.request_id, requestId);
    assert.equal(snapshot.source.goal, "Count lines in files");
    assert.match(JSON.stringify(snapshot.messages), /Also include empty files/);
    assert.doesNotMatch(JSON.stringify(snapshot), /Previous task|unrelated/);
    assert.equal(snapshot.calls.length, 2);
    assert.equal(
      (snapshot.calls[0] as { parent?: string }).parent,
      nested ? "codemode-1" : undefined,
    );
    assert.equal(snapshot.truncated, false);
    recorder.reset();
    recorder.begin(ctx);
    manager.appendMessage({ role: "user", content: "Next task", timestamp: 3 });
    assert.equal(recorder.snapshot(ctx, [])!.source.goal, "Next task");
    assert.deepEqual(recorder.snapshot(ctx, [])!.calls, []);
  }
});

test("long snapshots retain recent results and mark truncation without persisting credentials", () => {
  const ctx = context();
  const manager = ctx.sessionManager as SessionManager;
  const recorder = new Recorder();
  recorder.begin(ctx);
  manager.appendMessage({
    role: "user",
    content: "Summarize files",
    timestamp: 0,
  });
  for (let i = 0; i < 60; i++) {
    manager.appendMessage({
      role: "user",
      content: "x".repeat(7000),
      timestamp: i,
    });
    recorder.record({
      type: "tool_call",
      toolName: "read",
      toolCallId: `call-${i}`,
      input: { path: "x".repeat(7000) },
    } as ToolCallEvent);
  }
  recorder.record({
    type: "tool_call",
    toolName: "read",
    toolCallId: "last-call",
    input: {
      path: "final.txt",
      authorization: "Bearer abcdefghijklmnop123456789",
    },
  } as ToolCallEvent);
  manager.appendMessage({
    role: "user",
    content: "Final instruction",
    timestamp: 61,
  });
  const snapshot = recorder.snapshot(ctx, [])!;
  assert.equal(snapshot.source.goal, "Summarize files");
  assert.equal(snapshot.truncated, true);
  assert.ok(JSON.stringify(snapshot).length < 160_000);
  assert.match(JSON.stringify(snapshot.calls.at(-1)), /last-call/);
  assert.match(JSON.stringify(snapshot.messages.at(-1)), /Final instruction/);
  assert.doesNotMatch(JSON.stringify(snapshot), /abcdefghijklmnop123456789/);
});
