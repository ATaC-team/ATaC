import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ActivityWidget } from "../src/pi/activity.js";

function ui(mode: "tui" | "rpc" = "rpc", hasUI = true) {
  const frames: (string[] | undefined)[] = [];
  const ctx = {
    hasUI,
    mode,
    ui: {
      theme: {
        fg: (color: string, text: string) =>
          `${color === "accent" ? "\x1b[36m" : "\x1b[90m"}${text}\x1b[0m`,
      },
      setWidget(
        key: string,
        lines: string[] | undefined,
        options: { placement: string },
      ) {
        assert.equal(key, "atac");
        assert.equal(options.placement, "aboveEditor");
        frames.push(lines);
      },
    },
  } as unknown as ExtensionContext;
  return { frames, ctx };
}

test("RPC activity ticks, resets phase time, and preserves concurrent activities", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 0 });
  const { frames, ctx } = ui();
  const widget = new ActivityWidget();
  t.after(() => widget.dispose());
  widget.start("extraction", ctx, { kind: "extracting" });
  assert.deepEqual(frames.at(-1), [
    "ATaC  Extracting programs",
    "      Elapsed 0s",
  ]);
  t.mock.timers.tick(1000);
  assert.equal(frames.at(-1)?.[1], "      Elapsed 1s");
  t.mock.timers.tick(67000);
  assert.equal(frames.at(-1)?.[1], "      Elapsed 1m 08s");
  widget.start("automatic", ctx, {
    kind: "testing",
    programId: "task-summary",
    round: 1,
  });
  assert.deepEqual(frames.at(-1), [
    "ATaC  Extracting programs",
    "      Elapsed 1m 08s",
    "ATaC  Testing task-summary",
    "      Attempt 1 of 3    Elapsed 0s",
  ]);
  t.mock.timers.tick(8000);
  widget.start("automatic", ctx, {
    kind: "repairing",
    programId: "task-summary",
    round: 2,
  });
  assert.deepEqual(frames.at(-1)?.slice(2), [
    "ATaC  Repairing task-summary",
    "      Round 2 of 2    Elapsed 0s",
  ]);
  widget.finish("extraction");
  assert.equal(frames.at(-1)?.length, 2);
  widget.start("automatic", ctx, {
    kind: "testing",
    programId: "task-summary",
    round: 3,
  });
  assert.equal(frames.at(-1)?.[1], "      Attempt 3 of 3    Elapsed 0s");
  widget.finish("automatic");
  assert.equal(frames.at(-1), undefined);
  const count = frames.length;
  t.mock.timers.tick(10000);
  assert.equal(frames.length, count, "last completion stops the timer");
  assert.ok(frames.every((lines) => !lines?.join("").match(/[·\x1b]/)));
});

test("TUI uses theme colors for actions and elapsed time", () => {
  const { frames, ctx } = ui("tui");
  const widget = new ActivityWidget();
  try {
    widget.start("revision", ctx, {
      kind: "revising",
      programId: "task-summary",
    });
    assert.deepEqual(frames.at(-1), [
      "\x1b[36mATaC  Revising task-summary\x1b[0m",
      "\x1b[90m      Elapsed 0s\x1b[0m",
    ]);
  } finally {
    widget.dispose();
  }
  assert.equal(frames.at(-1), undefined);
});

test("dispose prevents stale updates after a replacement session starts", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"] });
  const { frames, ctx } = ui();
  const old = new ActivityWidget();
  old.start("old", ctx, { kind: "extracting" });
  old.dispose();
  assert.equal(frames.at(-1), undefined);
  const count = frames.length;
  t.mock.timers.tick(10000);
  assert.equal(frames.length, count);
  const current = new ActivityWidget();
  t.after(() => current.dispose());
  current.start("new", ctx, { kind: "revising", programId: "new-program" });
  old.start("late", ctx, { kind: "extracting" });
  old.finish("old");
  old.dispose();
  assert.equal(frames.length, count + 1);
  assert.equal(frames.at(-1)?.[0], "ATaC  Revising new-program");
});

test("headless activity never schedules a timer or accesses UI", (t) => {
  const interval = t.mock.method(globalThis, "setInterval");
  const widget = new ActivityWidget();
  widget.start("headless", { hasUI: false } as ExtensionContext, {
    kind: "extracting",
  });
  widget.finish("headless");
  widget.dispose();
  assert.equal(interval.mock.callCount(), 0);
});
