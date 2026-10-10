import { createTwoFilesPatch } from "diff";
import {
  highlightCode,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  wrapTextWithAnsi,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";
import type { Candidate } from "../library/program.js";
import type { Library } from "../library/storage.js";
import { statusLabel } from "./board.js";
import { frame, PANEL } from "./panel.js";

export type DetailAction =
  | "Test and publish"
  | "Revise"
  | "Archive"
  | undefined;
export interface DetailTab {
  title: string;
  text: string;
  language?: string;
  files?: { name: string; text: string }[];
}
export const canEdit = (c: Candidate) =>
  ["untested", "failed", "interrupted"].includes(c.status);

export function detailTabs(library: Library, c: Candidate): DetailTab[] {
  const b = library.bundle(c.revision);
  const m = b.manifest;
  const files = (bundle: typeof b) => [
    JSON.stringify(bundle.manifest, null, 2),
    bundle.main,
    bundle.tests,
  ];
  const previous = c.base_version
    ? files(library.bundle(c.base_version))
    : ["", "", ""];
  return [
    {
      title: "Overview",
      text: [
        m.purpose,
        "",
        "When to use",
        m.when_to_use,
        "",
        "Side effects",
        m.side_effects,
        "",
        `Tools: ${m.tools.join(", ") || "None"}`,
        `Test tools: ${m.test_tools.join(", ") || "None"}`,
        `Tags: ${m.tags.join(", ") || "None"}`,
        "",
        "Source request",
        c.source.goal,
        "",
        `Directory: ${c.source.cwd}`,
        `Created: ${c.created_at}`,
        `Updated: ${c.updated_at}`,
        "",
        `Program: ${c.program_id}`,
        `Revision: ${c.revision}`,
        `Base: ${c.base_version ?? "New program"}`,
      ].join("\n"),
    },
    { title: "Manifest", text: files(b)[0]!, language: "json" },
    { title: "Code", text: b.main, language: "javascript" },
    { title: "Tests", text: b.tests, language: "javascript" },
    {
      title: "Changes",
      text: "",
      files: files(b).map((text, i) => ({
        name: ["manifest.json", "main.js", "tests.js"][i]!,
        text:
          previous[i] === text
            ? "No changes"
            : createTwoFilesPatch(
                ["manifest.json", "main.js", "tests.js"][i]!,
                ["manifest.json", "main.js", "tests.js"][i]!,
                previous[i]!,
                text,
                c.base_version?.slice(0, 12) ?? "New program",
                c.revision.slice(0, 12),
              ),
      })),
    },
    {
      title: "Report",
      text:
        c.diagnostic ??
        (c.status === "published" ? "Tests passed." : "No test results."),
    },
  ];
}

export class ProgramDetail implements Component {
  private tab = 0;
  private file = 0;
  private offsets = new Map<string, number>();
  private pageSize = 1;
  private maxScroll = 0;
  private cache = new Map<string, string[]>();
  constructor(
    private tui: TUI,
    private theme: Theme,
    private name: string,
    private candidate: Candidate,
    private tabs: DetailTab[],
    private done: (result: DetailAction) => void,
  ) {}
  invalidate(): void {
    this.cache.clear();
  }
  private key() {
    return `${this.tab}:${this.tab === 4 ? this.file : 0}`;
  }
  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "q") ||
      matchesKey(data, "ctrl+c")
    )
      return this.done(undefined);
    if (canEdit(this.candidate)) {
      if (matchesKey(data, "t")) return this.done("Test and publish");
      if (matchesKey(data, "r")) return this.done("Revise");
      if (matchesKey(data, "x")) return this.done("Archive");
    }
    const key = this.key();
    let scroll = this.offsets.get(key) ?? 0;
    if (matchesKey(data, "right") || matchesKey(data, "tab"))
      this.tab = (this.tab + 1) % this.tabs.length;
    else if (matchesKey(data, "left") || matchesKey(data, "shift+tab"))
      this.tab = (this.tab + this.tabs.length - 1) % this.tabs.length;
    else if (/^[1-6]$/.test(data)) this.tab = Number(data) - 1;
    else if (this.tab === 4 && (data === "[" || data === "]"))
      this.file = (this.file + (data === "]" ? 1 : 2)) % 3;
    else if (matchesKey(data, "up")) scroll--;
    else if (matchesKey(data, "down")) scroll++;
    else if (matchesKey(data, "pageUp")) scroll -= this.pageSize;
    else if (matchesKey(data, "pageDown")) scroll += this.pageSize;
    else if (matchesKey(data, "home")) scroll = 0;
    else if (matchesKey(data, "end")) scroll = this.maxScroll;
    this.offsets.set(key, Math.max(0, Math.min(this.maxScroll, scroll)));
    this.tui.requestRender();
  }
  render(width: number): string[] {
    const height = this.tui.terminal.rows;
    if (width < 36 || height < 18)
      return frame(this.theme, width, height, this.name, [
        "Resize to at least 36 × 18",
        "Esc Back",
      ]);
    const inner = width - 4;
    const tab = this.tabs[this.tab]!;
    const file = tab.files?.[this.file];
    const text = file?.text ?? tab.text;
    const cacheKey = `${this.key()}:${width}`;
    let lines = this.cache.get(cacheKey);
    if (!lines) {
      const source = tab.language
        ? highlightCode(text.replace(/\t/g, "  "), tab.language)
        : text.split("\n");
      const digits = String(source.length).length;
      lines = source.flatMap((line, index) => {
        if (tab.language)
          return wrapTextWithAnsi(line, inner - digits - 3).map(
            (part, i) =>
              this.theme.fg(
                "dim",
                `${i === 0 ? String(index + 1).padStart(digits) : " ".repeat(digits)} │ `,
              ) + part,
          );
        const color = file
          ? line.startsWith("+")
            ? "success"
            : line.startsWith("-")
              ? "error"
              : line.startsWith("@@")
                ? "accent"
                : "text"
          : "text";
        return wrapTextWithAnsi(this.theme.fg(color, line), inner);
      });
      this.cache.set(cacheKey, lines);
    }
    const tabRows = wrapTextWithAnsi(
      this.tabs
        .map((t, i) =>
          this.theme.fg(
            i === this.tab ? "accent" : "muted",
            `${i === this.tab ? "[" : " "}${i + 1} ${t.title}${i === this.tab ? "]" : " "}`,
          ),
        )
        .join(" "),
      inner,
    );
    const actionRows = wrapTextWithAnsi(
      canEdit(this.candidate)
        ? "t Test and publish · r Revise · x Archive"
        : statusLabel(this.candidate.status),
      inner,
    );
    const hintRows = wrapTextWithAnsi(
      "←/→ Tabs · ↑/↓ Scroll · PgUp/PgDn · Home/End · Esc Back",
      inner,
    );
    this.pageSize = Math.max(
      1,
      height - 8 - tabRows.length - actionRows.length - hintRows.length,
    );
    this.maxScroll = Math.max(0, lines.length - this.pageSize);
    const scroll = Math.min(this.offsets.get(this.key()) ?? 0, this.maxScroll);
    this.offsets.set(this.key(), scroll);
    const body = lines.slice(scroll, scroll + this.pageSize);
    while (body.length < this.pageSize) body.push("");
    return frame(this.theme, width, height, this.name, [
      this.theme.fg(
        "muted",
        `${statusLabel(this.candidate.status)} · ${this.candidate.base_version ? "Update" : "New"} · ${this.candidate.revision.slice(0, 12)}`,
      ),
      ...tabRows,
      this.theme.fg(
        "muted",
        file
          ? `${file.name} · [ / ] Change file`
          : [
              "Overview",
              "manifest.json",
              "main.js",
              "tests.js",
              "Changes",
              "Test results",
            ][this.tab]!,
      ),
      this.theme.fg("borderMuted", "─".repeat(inner)),
      ...body,
      this.theme.fg(
        "dim",
        `${scroll + 1}–${Math.min(scroll + this.pageSize, lines.length)} / ${lines.length}`,
      ),
      ...actionRows.map((line) => this.theme.fg("accent", line)),
      ...hintRows.map((line) => this.theme.fg("dim", line)),
    ]);
  }
}

export async function openDetail(
  ctx: ExtensionContext,
  library: Library,
  c: Candidate,
  signal: AbortSignal,
): Promise<DetailAction> {
  const tabs = detailTabs(library, c);
  return ctx.ui.custom<DetailAction>((tui, theme, _keys, done) => {
    const close = () => done(undefined);
    signal.addEventListener("abort", close, { once: true });
    if (signal.aborted) queueMicrotask(close);
    return Object.assign(
      new ProgramDetail(tui, theme, c.program_id, c, tabs, done),
      {
        dispose() {
          signal.removeEventListener("abort", close);
        },
      },
    );
  }, PANEL);
}
