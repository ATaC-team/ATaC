import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth, type TUI, type Component } from "@earendil-works/pi-tui";
import {
  initTheme,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { InboxBoard, type BoardResult, type Card } from "../src/pi/board.js";
import { panelContext } from "../src/pi/panel.js";
import {
  ProgramDetail,
  detailTabs,
  type DetailAction,
} from "../src/pi/detail.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { openInbox } from "../src/pi/inbox.js";
import { Library } from "../src/library/storage.js";
import { Jobs } from "../src/harvest/jobs.js";
import { DEFAULT_LIMITS } from "../src/runtime/runner.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
} as unknown as Theme;
const terminal = { rows: 30 };
const tui = { terminal, requestRender() {} } as unknown as TUI;
function card(status: Card["candidate"]["status"], update = false): Card {
  return {
    candidate: {
      id: `${status}-${update}`,
      revision: "a".repeat(64),
      program_id: status,
      base_version: update ? "b".repeat(64) : null,
      status,
      source: {
        session_id: "s",
        request_id: "r",
        cwd: "/tmp",
        goal: "Read a file and count its lines",
      },
      created_at: "2026-10-10T00:00:00.000Z",
      updated_at: "2026-10-10T00:00:00.000Z",
      history: [],
    },
    manifest: {
      program_id: status,
      purpose: "Count lines in files",
      when_to_use: "Repeated counts",
      tags: [],
      tools: [],
      test_tools: [],
      side_effects: "None",
      input_schema: true,
      output_schema: true,
    },
  };
}
const right = "\x1b[C",
  down = "\x1b[B",
  enter = "\r",
  escape = "\x1b";

test("board groups all statuses, filters new and updated programs, and opens the selected revision", () => {
  const cards = [
    card("untested"),
    card("untested", true),
    card("testing"),
    card("revising"),
    card("failed"),
    card("interrupted"),
    card("published"),
    card("archived"),
  ];
  const actions: BoardResult[] = [];
  const board = new InboxBoard(
    tui,
    theme,
    () => cards,
    (result) => actions.push(result),
  );
  const screen = board.render(160).join("\n");
  for (const heading of [
    "Untested (2)",
    "In progress (2)",
    "Needs attention (2)",
    "Published (1)",
    "Archived (1)",
  ])
    assert.ok(screen.includes(heading), heading);
  assert.equal(actions.length, 0);
  board.handleInput("f");
  assert.match(board.render(160).join("\n"), /Programs · New/);
  board.handleInput("f");
  assert.match(board.render(160).join("\n"), /Programs · Updates/);
  board.handleInput(enter);
  assert.deepEqual(actions.pop(), { candidate: cards[1]!.candidate });
  board.handleInput("a");
  assert.equal(actions.pop(), "activity");
  board.handleInput(escape);
  assert.equal(actions.pop(), undefined);
});

test("board fits terminal sizes and scrolls columns and cards with the selection", () => {
  const cards = [
    ...Array.from({ length: 12 }, (_, i) => ({
      ...card("untested"),
      candidate: { ...card("untested").candidate, id: `card-${i}` },
      manifest: { ...card("untested").manifest, program_id: `program-${i}` },
    })),
    card("archived"),
  ];
  const board = new InboxBoard(
    tui,
    theme,
    () => cards,
    () => {},
  );
  for (let i = 0; i < 11; i++) board.handleInput(down);
  for (const [width, height] of [
    [160, 30],
    [80, 24],
    [50, 18],
    [36, 18],
    [30, 10],
  ]) {
    terminal.rows = height!;
    const lines = board.render(width!);
    assert.equal(lines.length, height);
    assert.ok(
      lines.every((line) => visibleWidth(line) <= width!),
      `${width}×${height}`,
    );
    assert.match(lines.join("\n"), width! < 36 ? /Resize/ : /program-11/);
    if (width! >= 36) assert.match(lines.join("\n"), /Esc Close/);
  }
  terminal.rows = 24;
  for (let i = 0; i < 4; i++) board.handleInput(right);
  assert.match(board.render(80).join("\n"), /Archived \(1\)/);
  assert.doesNotMatch(board.render(80).join("\n"), /Untested \(12\)/);
});

test("board refresh follows a candidate's new status without taking an action", () => {
  let value = card("revising");
  const actions: BoardResult[] = [];
  const board = new InboxBoard(
    tui,
    theme,
    () => [value],
    (result) => actions.push(result),
  );
  board.handleInput(right);
  const id = value.candidate.id;
  value = {
    ...value,
    candidate: {
      ...value.candidate,
      status: "untested",
      revision: "c".repeat(64),
    },
  };
  board.refresh();
  assert.match(board.render(120).join("\n"), /› Untested \(1\)/);
  assert.equal(actions.length, 0);
  board.handleInput(enter);
  assert.equal(
    (actions[0] as { candidate: Card["candidate"] }).candidate.id,
    id,
  );
  assert.equal(
    (actions[0] as { candidate: Card["candidate"] }).candidate.revision,
    "c".repeat(64),
  );
});

test("panel dialogs use full-screen overlays and close on cancellation", async () => {
  let component: (Component & { dispose?(): void }) | undefined;
  const ctx = {
    ui: {
      custom: async (factory: Function, options: unknown) => {
        assert.deepEqual(options, {
          overlay: true,
          overlayOptions: {
            width: "100%",
            maxHeight: "100%",
            anchor: "top-left",
          },
        });
        return new Promise((resolve) => {
          component = factory(tui, theme, {}, (value: unknown) => {
            component?.dispose?.();
            resolve(value);
          });
        });
      },
    },
  } as unknown as ExtensionContext;
  const controller = new AbortController();
  const panel = panelContext(ctx, controller.signal);
  const selected = panel.ui.select("Program\n" + "Details\n".repeat(60), [
    "Details",
    "Test and publish",
    "Back",
  ]);
  const initial = component!.render(80);
  assert.equal(initial.length, terminal.rows);
  assert.ok(initial.every((line) => visibleWidth(line) <= 80));
  component!.handleInput!(down);
  component!.handleInput!(enter);
  assert.equal(await selected, "Test and publish");
  const revision = panel.ui.input("Revision instructions", "Add edge cases");
  component!.handleInput!("Check empty arrays");
  component!.handleInput!(enter);
  assert.equal(await revision, "Check empty arrays");
  const cancelled = panel.ui.select("ATaC", ["Back"]);
  controller.abort();
  assert.equal(await cancelled, undefined);
});

test("TUI Inbox opens a board, archives through its panel, and returns to the updated column", async () => {
  const root = mkdtempSync(join(tmpdir(), "atac-board-"));
  const library = new Library(root);
  const jobs = new Jobs(library, DEFAULT_LIMITS);
  let screens = 0;
  const ctx = {
    cwd: root,
    mode: "tui",
    hasUI: true,
    ui: {
      custom: async (factory: Function, options: { overlay: boolean }) => {
        assert.equal(options.overlay, true);
        return new Promise((resolve) => {
          const component = factory(tui, theme, {}, (value: unknown) => {
            component.dispose?.();
            resolve(value);
          });
          const screen = component.render(140).join("\n");
          if (++screens === 1) {
            assert.match(screen, /ATaC Inbox/);
            assert.match(screen, /› Untested \(1\)/);
            component.handleInput(enter);
          } else if (screens === 2) {
            assert.match(screen, /Test and publish/);
            component.handleInput("x");
          } else {
            assert.equal(screens, 3);
            assert.match(screen, /› Archived \(1\)/);
            component.handleInput(escape);
          }
        });
      },
      select() {
        throw new Error("TUI must use a panel");
      },
      notify() {
        throw new Error("Unexpected notification");
      },
    },
  } as unknown as ExtensionContext;
  try {
    const c = card("untested");
    const saved = await library.save(
      {
        manifest: c.manifest,
        main: "return inputs;",
        tests: "await check.equal(await run(1), 1);",
      },
      c.candidate.source,
    );
    await openInbox(
      library,
      jobs,
      DEFAULT_LIMITS,
      ctx,
      new AbortController().signal,
    );
    assert.equal(screens, 3);
    assert.equal(library.candidate(saved.id).status, "archived");
    assert.equal(library.current(saved.program_id), null);
    assert.deepEqual(jobs.list(), []);
  } finally {
    await jobs.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("program details separate files, retain tab scroll, wrap code, and gate actions", async () => {
  initTheme("dark", false);
  const root = mkdtempSync(join(tmpdir(), "atac-detail-"));
  const library = new Library(root);
  try {
    const c = card("untested");
    const saved = await library.save(
      {
        manifest: c.manifest,
        main:
          "// " +
          "long code line 中文 ".repeat(20) +
          "END_OF_LONG_LINE\n" +
          Array.from({ length: 80 }, (_, i) => `// CODE_LINE_${i}`).join("\n") +
          "\nreturn inputs;",
        tests: "// TEST_ONLY\nawait check.equal(await run(1), 1);",
      },
      c.candidate.source,
    );
    const tabs = detailTabs(library, saved);
    const actions: DetailAction[] = [];
    const view = new ProgramDetail(
      tui,
      theme,
      c.manifest.program_id,
      saved,
      tabs,
      (action) => actions.push(action),
    );
    terminal.rows = 24;
    const render = () =>
      view.render(100).map(stripTerminalSequences).join("\n");
    assert.match(render(), /When to use/);
    assert.doesNotMatch(render(), /CODE_LINE|TEST_ONLY|input_schema/);
    view.handleInput("2");
    assert.match(render(), /"program_id"/);
    assert.doesNotMatch(render(), /CODE_LINE|TEST_ONLY/);
    view.handleInput("3");
    assert.match(render(), /END_OF_LONG_LINE/);
    assert.doesNotMatch(render(), /TEST_ONLY|"program_id"/);
    view.handleInput("\x1b[F");
    const bottom = render();
    assert.match(bottom, /CODE_LINE_79/);
    assert.match(bottom, /82 │ return inputs;/);
    view.handleInput("4");
    assert.match(render(), /TEST_ONLY/);
    assert.doesNotMatch(render(), /CODE_LINE/);
    view.handleInput("3");
    assert.equal(render(), bottom);
    view.handleInput("5");
    assert.match(render(), /manifest.json/);
    assert.doesNotMatch(render(), /CODE_LINE/);
    view.handleInput("]");
    assert.match(render(), /main.js/);
    assert.doesNotMatch(render(), /TEST_ONLY|"program_id"/);
    view.handleInput("4");
    for (const [width, height] of [
      [140, 30],
      [80, 24],
      [36, 18],
    ]) {
      terminal.rows = height!;
      const lines = view.render(width!);
      assert.equal(lines.length, height);
      assert.ok(lines.every((line) => visibleWidth(line) <= width!));
      assert.match(lines.map(stripTerminalSequences).join("\n"), /Esc Back/);
    }
    view.handleInput(enter);
    assert.equal(actions.length, 0);
    view.handleInput("t");
    assert.deepEqual(actions, ["Test and publish"]);
    const published = new ProgramDetail(
      tui,
      theme,
      c.manifest.program_id,
      { ...saved, status: "published" },
      tabs,
      (action) => actions.push(action),
    );
    for (const key of ["t", "r", "x"]) published.handleInput(key);
    assert.equal(actions.length, 1);
    published.handleInput(escape);
    assert.equal(actions.at(-1), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
